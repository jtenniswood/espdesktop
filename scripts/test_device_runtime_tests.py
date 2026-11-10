#!/usr/bin/env python3
"""Offline HTTP diagnostics tests. No native API, device SDK, or hardware."""
import asyncio
from contextlib import redirect_stdout
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import test_device_runtime as runtime
import test_release_hardware as release_hardware


def snapshot():
    return {"version": 1, "hostname": "test-panel", "mac_suffix": "ddeeff", "boot_id": 1,
            "uptime_ms": 10000, "reset_reason": 1,
            "firmware": {"esphome_version": "2026.10.2", "compilation_time": "test-build", "project_version": "dev", "model": "test"},
            "memory": {"heap_free_percent": 40, "heap_largest_bytes": 20000, "psram_free_percent": 80, "psram_largest_bytes": 100000}}


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.evidence = runtime.Evidence(Path(self.tmp.name))
        self.stdout = redirect_stdout(io.StringIO()); self.stdout.__enter__(); self.addCleanup(self.stdout.__exit__, None, None, None)

    def test_monotonic_64bit_uptime_does_not_wrap(self):
        s = snapshot(); s['uptime_ms'] = 0xFFFFFFFF
        self.evidence.sample(s); s = deepcopy(s); s['uptime_ms'] += 10000
        self.evidence.sample(s); self.assertFalse(self.evidence.failures)

    def test_changed_boot_id_detects_restart_even_when_uptime_increases(self):
        self.evidence.sample(snapshot()); s = snapshot(); s['boot_id'] = 2; s['uptime_ms'] += 1000
        self.evidence.sample(s); self.assertEqual(self.evidence.failures['reboot'], 1)

    def test_decreasing_uptime_also_fails(self):
        self.evidence.sample(snapshot()); s = snapshot(); s['uptime_ms'] = 10
        self.evidence.sample(s); self.assertEqual(self.evidence.failures['reboot'], 1)

    def test_identity_and_firmware_changes_fail(self):
        self.evidence.sample(snapshot()); s = snapshot(); s['mac_suffix'] = 'aabbcc'; s['firmware']['compilation_time'] = 'different'
        self.evidence.sample(s)
        self.assertEqual(self.evidence.failures['identity_changed'], 1)
        self.assertEqual(self.evidence.failures['firmware_changed'], 1)

    def test_expected_version_build_and_heap_pressure(self):
        s = snapshot(); s['memory']['heap_free_percent'] = 4
        self.evidence.sample(s, 'wrong', 'wrong')
        for failure in ('wrong_firmware_version', 'wrong_build_timestamp', 'memory_pressure'):
            self.assertEqual(self.evidence.failures[failure], 1)

    def test_reports_require_multiple_samples_and_memory(self):
        args = runtime.arguments(['--host', 'fake', '--output', str(Path(self.tmp.name)/'new')])
        report = runtime.final_report(self.evidence, args)
        self.assertEqual(report['status'], 'failed')
        self.assertIn('incomplete_http_coverage', report['failures'])
        self.assertIn('missing_memory_diagnostics', report['failures'])


class ReleaseHardwareTests(unittest.TestCase):
    def test_reports_checkpoint_memory_and_binds_the_candidate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest = root / "candidate.json"
            manifest.write_text(json.dumps({"releaseVersion": "v9.8.7",
                                            "supportedDevices": [release_hardware.DEVICE],
                                            "artifacts": {f"{release_hardware.DEVICE}.ota.bin": {
                                                "appElfSha256": "a" * 64}}}))
            expected = release_hardware.candidate(manifest, "1234")
            data = snapshot()
            data["firmware"].update(model=release_hardware.DEVICE, project_version="v9.8.7", app_elf_sha256="a" * 64)
            data["navigation"] = dict.fromkeys(runtime.NAVIGATION_METRICS, 0)
            probe = unittest.mock.Mock()
            probe.sample.side_effect = lambda: deepcopy(data)
            probe.json.return_value = {"mac_companion": {"paired": True, "connected": True}}

            config = (15, b"before-digest")
            probe.native_config_snapshot.side_effect = lambda **_: config

            def confirm(prompt, *, change=True, keep=True, restart=True):
                nonlocal config
                if prompt.startswith(release_hardware.NAVIGATION):
                    data["navigation"].update(page_open_frame_ms=14, back_frame_ms=5)
                if prompt.startswith("Block internet access") and change:
                    config = (16, b"saved-digest")
                if prompt.startswith("Restart") and restart:
                    if not keep:
                        config = (15, b"before-digest")
                    data["boot_id"] += 1
                    data["uptime_ms"] = 1
                return "pass"

            with redirect_stdout(io.StringIO()), patch("sys.stderr", new=io.StringIO()):
                self.assertEqual(release_hardware.run(probe, root / "report", expected, confirm), 0)
                self.assertEqual(probe.native_config_snapshot.call_args_list, [
                    unittest.mock.call(require_durable_v2=False), unittest.mock.call(), unittest.mock.call(),
                ])
                for case, options in (("no-reboot", {"restart": False}),
                                      ("no-save", {"change": False}), ("lost-save", {"keep": False})):
                    config = (15, b"before-digest")
                    def confirm_failure(prompt):
                        return confirm(prompt, **options)

                    self.assertEqual(release_hardware.run(probe, root / case, expected, confirm_failure), 1)
                    self.assertEqual(json.loads((root / case / "report.json").read_text())["status"], "failed")
            report = json.loads((root / "report" / "report.json").read_text())
            release_hardware.verify_report(report, expected)
            wrong_build = deepcopy(report)
            wrong_build["firmware"]["app_elf_sha256"] = "b" * 64
            with self.assertRaises(ValueError):
                release_hardware.verify_report(wrong_build, expected)
            self.assertEqual(len(report["steps"]), 9)
            self.assertEqual(report["steps"][-1]["after"]["psram_largest_bytes"], 100000)
            navigation = report["steps"][1]["navigation"]
            self.assertEqual(navigation["before"]["page_open_frame_ms"], 0)
            self.assertEqual(navigation["after"]["page_open_frame_ms"], 14)
            self.assertEqual(navigation["after"]["back_frame_ms"], 5)
            missing_navigation = deepcopy(report)
            del missing_navigation["steps"][1]["navigation"]
            with self.assertRaisesRegex(ValueError, "missing navigation measurements"):
                release_hardware.verify_report(missing_navigation, expected)
            self.assertEqual(report["native_save"], {"before": 15, "saved": 16, "reboot": 16})
            self.assertNotIn("digest", json.dumps(report["native_save"]))
            report_without_save = deepcopy(report)
            del report_without_save["native_save"]
            with self.assertRaises(ValueError):
                release_hardware.verify_report(report_without_save, expected)
            with self.assertRaises(ValueError):
                release_hardware.verify_report(report, release_hardware.candidate(manifest, "1235"))
            manifest.write_text(manifest.read_text() + "\n")
            with self.assertRaises(ValueError):
                release_hardware.verify_report(report, release_hardware.candidate(manifest, "1234"))
            report["steps"].pop()
            with self.assertRaises(ValueError):
                release_hardware.verify_report(report, expected)


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.health = snapshot(); self.identity = {"hostname": "test-panel", "mac_suffix": "ddeeff", "restart_required": False}
        self.paths = []; self.status = 200; self.content_type = 'application/json'; self.oversized = False
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.paths.append(self.path)
                if self.path == "/api/v1/config":
                    owner.requested_version = self.headers.get("X-Panel-Config-Version")
                    self.send_response(owner.status)
                    self.send_header("Content-Type", "application/vnd.espdesktop.panel-config")
                    self.send_header("X-Panel-Config-Version", "2")
                    self.send_header("X-Panel-Config-Durable-Version", owner.durable_version)
                    self.send_header("X-Panel-Config-Generation", "42")
                    self.end_headers()
                    self.wfile.write(owner.config_bytes)
                    return
                bodies = {'/api/v1/identity': owner.identity, '/api/v1/capabilities': {'api': {'version': 1}}, '/api/v1/diagnostics': owner.health}
                self.send_response(owner.status); self.send_header('Content-Type', owner.content_type); self.end_headers()
                self.wfile.write(b'x'*(runtime.MAX_BODY+1) if owner.oversized else json.dumps(bodies[self.path]).encode())
            def log_message(self, *_): pass
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.addCleanup(self.cleanup)
        self.probe = runtime.HttpProbe('127.0.0.1', self.server.server_port, 1)

    def cleanup(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def test_real_http_diagnostics_and_field_whitelist(self):
        self.health['saved_layout'] = 'secret config'; self.health['firmware']['token'] = 'secret'
        self.health['memory']['entity_password'] = 'private'
        s = self.probe.sample()
        self.assertNotIn('secret', json.dumps(s)); self.assertNotIn('private', json.dumps(s))
        self.assertEqual(s['memory']['heap_free_percent'], 40)
        self.assertEqual(self.paths, ['/api/v1/identity', '/api/v1/capabilities', '/api/v1/diagnostics'])

    def test_can_read_a_v1_baseline_but_requires_durable_v2_by_default(self):
        self.durable_version = "2"
        self.config_bytes = b"EPCF\x02\x00\x10\x00" + (16).to_bytes(4, "little") + b"\0" * 20
        generation, fingerprint = self.probe.native_config_snapshot()
        self.assertEqual(self.requested_version, "2")
        self.assertEqual(generation, 42)
        self.assertEqual(len(fingerprint), 32)
        self.durable_version = "1"
        with self.assertRaises(ValueError):
            self.probe.native_config_snapshot()
        self.assertEqual(self.probe.native_config_snapshot(require_durable_v2=False), (generation, fingerprint))
        self.durable_version = "2"
        self.config_bytes = self.config_bytes[:-1]
        with self.assertRaises(ValueError):
            self.probe.native_config_snapshot()

    def test_mismatched_http_identities_fail(self):
        self.health['mac_suffix'] = 'aabbcc'
        with self.assertRaises(ValueError): self.probe.sample()

    def test_missing_build_or_memory_cannot_pass(self):
        for section, key in [('firmware','compilation_time'), ('memory','heap_free_percent')]:
            self.health = snapshot(); del self.health[section][key]
            with self.subTest(key=key), self.assertRaises(ValueError): self.probe.sample()

    def test_malformed_counters_or_memory_are_rejected(self):
        for section, key, value in [(None,'uptime_ms',True),(None,'boot_id',-1),('memory','heap_free_percent',float('nan')),('memory','heap_free_percent',101),('memory','heap_largest_bytes',-1)]:
            self.health = snapshot(); target = self.health[section] if section else self.health; target[key] = value
            with self.subTest(key=key,value=value), self.assertRaises(ValueError): self.probe.sample()

    def test_http_errors_content_type_and_body_limit(self):
        self.status = 401
        with self.assertRaises(Exception): self.probe.sample()
        self.status = 200; self.content_type = 'text/html'
        with self.assertRaises(ValueError): self.probe.sample()
        self.content_type = 'application/json'; self.oversized = True
        with self.assertRaises(ValueError): self.probe.sample()

    def test_restart_required_is_not_ready(self):
        self.identity['restart_required'] = True
        with self.assertRaises(ValueError): self.probe.sample()


class RunnerTests(unittest.IsolatedAsyncioTestCase):
    async def run_fake(self, change=None, error=False, cancel=False):
        with tempfile.TemporaryDirectory() as tmp:
            args = runtime.arguments(['--host','fake','--duration','.04','--interval','.005','--expect-version','2026.10.2','--expect-build','test-build','--output',str(Path(tmp)/'result')])
            class Probe:
                def __init__(self, *_): self.calls = 0
                def sample(self):
                    self.calls += 1
                    if error: raise TimeoutError('secret URL/password')
                    s = snapshot(); s['uptime_ms'] += self.calls
                    if self.calls > 1 and change: change(s)
                    return s
            with redirect_stdout(io.StringIO()):
                task = asyncio.create_task(runtime.run_suite(args, Probe))
                if cancel:
                    await asyncio.sleep(.015); task.cancel()
                code = await task
            report = json.loads((args.output/'report.json').read_text())
            self.assertNotIn('secret', (args.output/'events.jsonl').read_text())
            return code, report

    async def test_passive_success_collects_health_without_native_api(self):
        code, report = await self.run_fake()
        self.assertEqual(code, 0, report); self.assertGreaterEqual(report['counts']['http_sample'], 2)
        self.assertEqual(report['http_identity']['mac_suffix'], 'ddeeff')
        self.assertEqual(report['memory']['heap_free_percent']['minimum'], 40)

    async def test_reboots_firmware_changes_and_identity_changes_fail(self):
        for key, value, failure in [('boot_id',2,'reboot'), ('mac_suffix','aabbcc','identity_changed')]:
            code, report = await self.run_fake(lambda s: s.update({key:value}))
            self.assertEqual(code,1); self.assertIn(failure,report['failures'])
        code, report = await self.run_fake(lambda s: s['firmware'].update(compilation_time='changed'))
        self.assertEqual(code,1); self.assertIn('firmware_changed',report['failures'])

    async def test_outage_and_interruption_cannot_pass(self):
        code, report = await self.run_fake(error=True)
        self.assertEqual(code,1); self.assertIn('http_error',report['failures'])
        code, report = await self.run_fake(cancel=True)
        self.assertEqual(code,1); self.assertIn('interrupted',report['failures'])


class CliTests(unittest.TestCase):
    def test_explicit_host_new_report_directory_and_no_retired_native_actions(self):
        with tempfile.TemporaryDirectory() as tmp, redirect_stdout(io.StringIO()), patch('sys.stderr',io.StringIO()):
            for args in [[],['--host','http://fake'],['--host','fake','--output',tmp],['--host','fake','--api-port','6053'],['--host','fake','--modal-entity','media_player.office']]:
                with self.subTest(args=args), self.assertRaises(SystemExit): runtime.arguments(args)


if __name__ == '__main__': unittest.main()
