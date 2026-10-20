# Runtime and source notices

The Cloud & Capital analytical projects and CCAC are distributed under their
MIT licenses, copied verbatim in `vendor/licenses/`. Their upstream repositories
and source revisions are recorded in `sources.lock.json`.

The browser runtime is [Pyodide 0.29.4](https://github.com/pyodide/pyodide/tree/0.29.4),
distributed under [MPL 2.0](https://github.com/pyodide/pyodide/blob/0.29.4/LICENSE).
Its npm package, including prebuilt CPython/WebAssembly assets, is pinned by
the frontend npm integrity lock. The Python standard library is covered by the
[Python Software Foundation license](https://docs.python.org/3.13/license.html).
Pyodide's upstream sources and notices remain available at those links.

The jsonschema dependency wheels (attrs, jsonschema, jsonschema-specifications,
pyrsistent, referencing, rpds-py, six, and typing-extensions) are copied intact,
including their individual distribution metadata and license notices. Their
versions and content hashes remain in the distributed Pyodide package lock.
No customer data is part of this source/runtime distribution.
