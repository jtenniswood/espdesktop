#!/usr/bin/env python3
"""Exercise release image-pull retries without touching a Docker daemon."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile

import yaml

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    workflow = yaml.safe_load((ROOT / '.github/workflows/release.yml').read_text())
    steps = workflow['jobs']['build-firmware']['steps']
    pull = next(step['run'] for step in steps if step.get('name') == 'Pull ESPHome image')
    for locking in (False, True):
        for failures in (0, 1, 2):
            with tempfile.TemporaryDirectory(prefix='release-docker-retry-') as directory:
                temporary = Path(directory)
                docker = temporary / 'docker'
                docker.write_text('''#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >> "$RETRY_TEST_LOG"
if [ "$1" = pull ]; then
  count=0
  if [ -f "$RETRY_TEST_COUNT" ]; then read -r count < "$RETRY_TEST_COUNT"; fi
  count=$((count + 1))
  printf '%s\\n' "$count" > "$RETRY_TEST_COUNT"
  [ "$count" -gt "$RETRY_TEST_FAILURES" ]
fi
''')
                docker.chmod(0o755)
                flock = temporary / 'flock'
                flock.write_text('#!/usr/bin/env bash\nshift\nexec "$@"\n')
                flock.chmod(0o755)
                env = dict(os.environ, PATH=f'{temporary}:{os.environ["PATH"]}',
                           DOCKER=str(docker), ESPHOME_VERSION='test',
                           GITHUB_ENV=str(temporary / 'env'), GITHUB_WORKSPACE=directory,
                           RETRY_TEST_LOG=str(temporary / 'calls'),
                           RETRY_TEST_COUNT=str(temporary / 'count'),
                           RETRY_TEST_FAILURES=str(failures),
                           ESPDESKTOP_CLEAN_RUNNER_UPDATES='false',
                           ESPDESKTOP_CLEAN_LEGACY_ESPHOME_CACHE='false',
                           ESPDESKTOP_DOCKER_LOCK_HELD='false',
                           # Even a runner opting into broad maintenance must
                           # not prune containers or volumes during pull recovery.
                           ESPDESKTOP_DOCKER_PRUNE_CONTAINERS='true',
                           ESPDESKTOP_DOCKER_PRUNE_VOLUMES='true')
                prefix = '' if locking else '''command() {
  if [ "$1" = -v ] && [ "$2" = flock ]; then return 1; fi
  builtin command "$@"
}
export -f command
'''
                result = subprocess.run(['bash', '-e', '-o', 'pipefail', '-c', prefix + pull],
                                        cwd=ROOT, env=env, capture_output=True, text=True)
                calls = (temporary / 'calls').read_text().splitlines()
                assert (result.returncode == 0) == (failures < 2), result.stderr
                assert sum(call.startswith('pull ') for call in calls) == (1 if failures == 0 else 2), calls
                assert not any(call.startswith(('system prune', 'container prune', 'volume prune'))
                               for call in calls), calls
                assert any(call.startswith('builder prune ') for call in calls) == (failures > 0), calls
                published = (temporary / 'env').read_text() if (temporary / 'env').exists() else ''
                assert ('ESPHOME_IMAGE=' in published) == (failures < 2), published
    print('Release Docker retry checks passed (six success/failure and lock scenarios).')


if __name__ == '__main__':
    main()
