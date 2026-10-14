MangaFire request signing attribution

Signing.ts adapts VrfSigner.kt from keiyoushi/extensions-source.
https://github.com/keiyoushi/extensions-source/blob/eafc5c6733fc93b95786af74e572d67124111766/src/all/mangafire/src/eu/kanade/tachiyomi/extension/all/mangafire/VrfSigner.kt

Reference retrieved and live verified on 2026-10-13.

Upstream license: Apache License 2.0, included in Apache-2.0.txt.
Modifications: TypeScript port, portable UTF-8 and base64, query serialization.
The independently maintained adapter does not load third party extension code at runtime.
The public website can change its signing tables. HTTP 403 diagnostics must be investigated against the current website protocol before updating these tables.
