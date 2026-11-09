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


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.health = snapshot(); self.identity = {"hostname": "test-panel", "mac_suffix": "ddeeff", "restart_required": False}
        self.paths = []; self.status = 200; self.content_type = 'application/json'; self.oversized = False
        owner = self
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.paths.append(self.path)
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
