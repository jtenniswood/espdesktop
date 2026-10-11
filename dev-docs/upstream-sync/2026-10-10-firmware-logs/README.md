# Monthly sync firmware logs

These compressed files preserve the original ESPHome compiler output for the
completed firmware attempts recorded in the October monthly audit. Successful
and failed attempts are retained. Queued or replaced jobs are not compile attempts.

Each JSON build record links its `logArchive` relative to the repository root.
`logSha256` identifies the original log bytes; `archiveSha256` identifies the
compressed file. Identical output is stored once. The original temporary path is
retained only as local provenance.

Download or check out a log and decompress it with `gzip -dc <path>` to inspect
its output. Compiler success verifies a build, not physical device behaviour.
