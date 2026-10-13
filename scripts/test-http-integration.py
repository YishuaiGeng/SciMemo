"""Run the TypeScript transport against an isolated, disposable HTTP server."""
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def main():
    project = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix='scimemo-http-test-') as directory:
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        endpoint = f'http://127.0.0.1:{port}'
        token = secrets.token_urlsafe(32)
        environment = {
            **os.environ,
            'SCIMEMO_DB_PATH': str(Path(directory) / 'test.sqlite3'),
            'SCIMEMO_SYNC_TOKEN': token,
            'SCIMEMO_TEST_URL': endpoint,
            'SCIMEMO_TEST_TOKEN': token,
        }
        process = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'server.app.main:create_app',
             '--factory', '--host', '127.0.0.1', '--port', str(port),
             '--log-level', 'warning', '--no-access-log'],
            cwd=project, env=environment,
        )
        try:
            deadline = time.monotonic() + 15
            request = urllib.request.Request(
                endpoint + '/v1/info', headers={'Authorization': 'Bearer ' + token},
            )
            # A local test must not inherit the developer's outbound HTTP proxy.
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            while True:
                if process.poll() is not None:
                    raise RuntimeError('Temporary integration server exited before readiness')
                try:
                    with opener.open(request, timeout=1) as response:
                        if response.status == 200:
                            break
                except (urllib.error.URLError, TimeoutError):
                    if time.monotonic() >= deadline:
                        raise RuntimeError('Temporary integration server did not become ready')
                    time.sleep(0.1)
            npm = 'npm.cmd' if os.name == 'nt' else 'npm'
            subprocess.run([npm, 'run', 'test:integration'], cwd=project,
                           env=environment, check=True, timeout=120)
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == '__main__':
    main()
