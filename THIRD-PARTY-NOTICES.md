# Third-Party Notices

Deployable Knowledge is distributed under the [MIT License](LICENSE). The application bundles and
downloads third-party components that are licensed separately. This file records those components
and the terms that govern them.

Nothing in this file changes the license of Deployable Knowledge's own source code. Where a bundled
component carries copyleft terms, those terms govern **that component only**.

---

## 1. FFmpeg — GNU General Public License v3.0 or later

**Component:** `ffmpeg-static@5.3.0`, which installs a prebuilt FFmpeg executable at
`node_modules/ffmpeg-static/ffmpeg` (`ffmpeg.exe` on Windows).
**Build:** `ffmpeg-7.0.2-amd64-static`, produced by John Van Sickle
(<https://johnvansickle.com/ffmpeg/>).
**License:** GPL-3.0-or-later. The build's own `ffmpeg.README` states: _"This static build is
licensed under the GNU General Public License version 3."_ It is compiled with GPL-licensed
components including `libx264`, `libx265`, `libxvid`, and `libvo-amrwbenc`.

The full GPLv3 text ships with the application at `node_modules/ffmpeg-static/ffmpeg.LICENSE`, and
is also available at <https://www.gnu.org/licenses/gpl-3.0.html>.

### Relationship to Deployable Knowledge

Deployable Knowledge does not link against FFmpeg. It executes the binary as a separate process over
FFmpeg's documented command-line interface (`src/lib/server/transcription/audio-decoder.ts` uses
`child_process.spawn`) solely to decode audio files to raw PCM for transcription. FFmpeg and
Deployable Knowledge are separate and independent works distributed together; the GPL governs the
FFmpeg executable, and the MIT License governs Deployable Knowledge.

### Written offer for corresponding source

In accordance with GPLv3 §6, the complete corresponding source code for the bundled FFmpeg binary is
available from:

- FFmpeg upstream source: <https://ffmpeg.org/download.html> (release 7.0.2)
- The packaging project that produced this binary: <https://github.com/eugeneware/ffmpeg-static>
- The build itself and its configuration: <https://johnvansickle.com/ffmpeg/>

For a period of three years from the date you received this software, the maintainers will also
provide, on request, a complete machine-readable copy of the corresponding source for the FFmpeg
build distributed with this application, for no more than the cost of physically performing the
distribution. Requests may be filed as an issue on the project repository:
<https://github.com/cstello-2/Deployable-Knowledge>.

### Patent notice

The bundled build includes `libx264` and `libx265`, which implement the H.264 and H.265 standards.
Copyright licensing and patent licensing are separate matters; the GPL grants no patent license for
those codecs from their respective patent holders.

---

## 2. libvips — GNU Lesser General Public License v3.0 or later

**Component:** `@img/sharp-libvips-<platform>@1.3.2`, the prebuilt libvips image-processing library
used by `sharp@0.35.3` for page-image rasterization (`src/lib/server/rag/chunk/page-images.ts`).
**License:** LGPL-3.0-or-later. Upstream: <https://github.com/libvips/libvips>.

`sharp` itself and the `@img/sharp-<platform>` native addon are Apache-2.0. Only the libvips payload
is LGPL.

libvips is loaded dynamically as a shared library by the `sharp` native addon, and is shipped
unmodified. Under LGPLv3 §4, recipients may modify libvips and relink the application against a
modified version: replace the shared library inside
`node_modules/@img/sharp-libvips-<platform>/lib/` in the installed application with your own build
of the same soname. The LGPLv3 text is available at <https://www.gnu.org/licenses/lgpl-3.0.html>,
and libvips source is available from the upstream repository above.

Windows releases carry `@img/sharp-libvips-win32-x64` and Ubuntu releases carry
`@img/sharp-libvips-linux-x64` under the same terms.

---

## 3. LibreOffice (WebAssembly) — Mozilla Public License 2.0

**Component:** `@matbee/libreoffice-converter@2.7.2` (~243 MB), used to convert `.docx` and `.pptx`
documents to PDF during ingestion.
**License:** MPL-2.0. Upstream: <https://github.com/matbee-eth/libreoffice-converter>; LibreOffice
itself: <https://www.libreoffice.org/about-us/source-code/>.

MPL-2.0 is file-level copyleft. The covered files are shipped unmodified; their source is available
from the upstream projects above. The MPL-2.0 text is available at
<https://mozilla.org/MPL/2.0/>.

---

## 4. Pyodide — Mozilla Public License 2.0

**Component:** `pyodide@314.0.2`, the WebAssembly Python runtime backing the assistant's Python tool
(`src/lib/server/tools/python.ts`).
**License:** MPL-2.0. Upstream: <https://github.com/pyodide/pyodide>.

Pyodide embeds CPython, distributed under the Python Software Foundation License 2.0, in
`python_stdlib.zip` (<https://docs.python.org/3/license.html>).

Pyodide additionally downloads scientific packages **at runtime** into the directory named by
`PYODIDE_PACKAGE_CACHE_DIR`; these are fetched on demand and are **not** bundled in the installer.
They include NumPy and pandas (BSD-3-Clause) and Matplotlib (Matplotlib License, a
BSD-style/PSF-derived license). Each carries its own terms.

---

## 5. Tesseract OCR — Apache License 2.0

**Components:**

- `tesseract.js@7.0.0`, the OCR engine used for scanned PDF pages
  (`src/lib/server/rag/chunk/text-extract.ts`). Upstream:
  <https://github.com/naptha/tesseract.js>.
- `eng.traineddata`, the English trained-data model, downloaded at runtime from
  <https://github.com/tesseract-ocr/tessdata> (tag 4.1.0) rather than shipped with the application.

**License:** Apache-2.0 for both, available at <https://www.apache.org/licenses/LICENSE-2.0>.
Tesseract OCR is copyright Google Inc. and contributors. Attribution notices are retained per
Apache-2.0 §4.

---

## 6. Models downloaded at runtime

Model weights and OCR language data are **not** bundled in the installer. The first-run setup page
downloads them from Hugging Face and GitHub, or they download on first use when setup is skipped.
Each carries its own terms.

### Gemma models — Google Gemma Terms of Use

`unsloth/gemma-4-E2B-it-GGUF` and `unsloth/gemma-4-E4B-it-GGUF`, offered in Settings → local models
(`src/lib/constants/local-models.ts`).

**Gemma is not an OSI-approved open-source license.** Use is governed by the Gemma Terms of Use,
which impose use restrictions through Google's Gemma Prohibited Use Policy and require that these
terms be passed on to anyone who receives the model or a derivative of it.

- Gemma Terms of Use: <https://ai.google.dev/gemma/terms>
- Gemma Prohibited Use Policy: <https://ai.google.dev/gemma/prohibited_use_policy>

By downloading a Gemma model through this application, you agree to those terms.

### Other models

- `nomic-ai/nomic-embed-text-v1.5` — embeddings. Apache-2.0.
- `Xenova/whisper-small.en` — audio transcription. ONNX conversion of `openai/whisper-small.en`
  (Apache-2.0 on Hugging Face; OpenAI's original Whisper release is MIT).
- `Xenova/wav2vec2-base-960h` — word timing alignment. ONNX conversion of Meta's
  `facebook/wav2vec2-base-960h` (Apache-2.0). The conversion does not declare a license of its own.
- `cross-encoder/ettin-reranker-32m-v1` — default cross-encoder reranking. Apache-2.0.
- `Xenova/ms-marco-MiniLM-L-6-v2` — alternative cross-encoder reranking. Apache-2.0.
- `tesseract-ocr/tessdata` `eng.traineddata` (4.1.0) — OCR language data. Apache-2.0.

### Voice activity detection — Silero VAD

`models/vad/silero_vad_v4.onnx`, included in this repository and the installer, is the official
Silero VAD v4.0 ONNX model (snakers4/silero-vad, MIT, Copyright (c) 2020-present Silero Team). It runs
through `onnxruntime-node`. The speech-segment logic in
`src/lib/server/transcription/voice-activity-detection.ts` is a TypeScript port of
`get_speech_timestamps` from silero-vad 6.2.3 (same license; text in §9).

### Speaker diarization — pyannote.audio with SpeechBrain ECAPA-TDNN

Speaker diarization follows pyannote.audio's speaker diarization pipeline (MIT, Copyright (c) 2020
CNRS), using the segmentation and clustering of `pyannote/speaker-diarization-3.1` with
SpeechBrain speaker embeddings. It runs two networks through ONNX Runtime. Both are downloaded from
Hugging Face on first use, without an account or access token, into `models/speaker-diarization/`:

- Segmentation: `pyannote/segmentation-3.0` by Hervé Bredin and Alexis Plaquet (MIT, © CNRS),
  in the ONNX conversion published as `onnx-community/pyannote-segmentation-3.0` (MIT).
- Speaker embeddings: `speechbrain/spkrec-ecapa-voxceleb` by the SpeechBrain project (Apache-2.0),
  an ECAPA-TDNN model (Desplanques, Thienpondt and Demuynck, Ghent University – imec) trained on
  VoxCeleb, in the unmodified ONNX export published as `astrolabos/ecapa-tdnn` (Apache-2.0).

The diarization pipeline in `src/lib/server/transcription/diarization/` is a TypeScript port of
pyannote.audio 4.0.7 and of SpeechBrain's filterbank features (Apache-2.0). Its agglomerative
clustering (`ahc.ts`) ports SciPy's centroid linkage (`scipy.cluster.hierarchy.linkage`, through its
`fast_linkage` routine) and distance-threshold flat clustering (`scipy.cluster.hierarchy.fcluster`),
which pyannote.audio calls (BSD-3-Clause, Copyright (c) 2001-2002 Enthought, Inc. 2003, SciPy
Developers). Deployable Knowledge is not endorsed by the SciPy developers. The clustering threshold
(0.75) was chosen for the ECAPA embeddings on AMI meeting recordings. Unlike pyannote.audio, small
speaker groups that sound unlike every larger group are kept as their own speaker instead of being
merged, so that a person who speaks only briefly is still identified.

The full license texts for pyannote.audio, SciPy, Silero VAD, and SpeechBrain are reproduced in §9.

---

## 7. Other bundled runtimes

| Component                   | Version | License                                                   |
| --------------------------- | ------- | --------------------------------------------------------- |
| Electron                    | 43.7.7  | MIT (bundles Chromium — BSD-3-Clause — and Node.js — MIT) |
| `node-llama-cpp`            | 3.19.1  | MIT (bundles llama.cpp — MIT)                             |
| `onnxruntime-node`          | 1.30.0  | MIT (ONNX Runtime, Microsoft)                             |
| `@huggingface/transformers` | 4.3.0   | Apache-2.0                                                |
| `@libsql/client`            | 0.17.4  | MIT (libSQL, a fork of SQLite — public domain)            |
| `sharp`                     | 0.35.5  | Apache-2.0 (see §2 for libvips)                           |
| `exceljs`                   | 4.4.0   | MIT                                                       |
| `pdf-parse`                 | 2.4.5   | MIT                                                       |

---

## 8. Permissively licensed dependencies

The remaining ~730 packages in the dependency tree are distributed under permissive licenses: MIT,
ISC, Apache-2.0, BSD-3-Clause, BSD-2-Clause, BlueOak-1.0.0, and single packages under 0BSD,
Unlicense, Python-2.0, WTFPL, and various dual-license combinations.
Their full license texts are included in the respective package directories under `node_modules/`.

Specific acknowledgements:

- **shadcn-svelte** — the 98 UI primitive files under `src/lib/components/ui/` were generated from
  the shadcn-svelte registry (<https://shadcn-svelte.com>). MIT, copyright Huntabyte and
  contributors.
- **bits-ui** (`2.18.1`) and **svelte-toolbelt** (`0.10.6`) — MIT, copyright Hunter Johnston and
  Thomas G. Lopes. Note that `svelte-toolbelt` omits the `license` field from its `package.json` but
  ships an MIT `LICENSE` file.
- **`buffers@0.1.1`** — reached transitively via `exceljs` → `unzipper` → `binary`. This package
  declares no license field and ships no license file. It is authored by James Halliday
  (substack), whose packages are conventionally MIT, but its terms are formally unstated upstream.
- **`dompurify`** (`3.4.14`) — dual-licensed (MPL-2.0 OR Apache-2.0); used here under Apache-2.0.
- **`jszip`** (`3.10.1`) — dual-licensed (MIT OR GPL-3.0-or-later); used here under MIT.
- **`youtubei.js`** (`18.0.0`) — MIT, copyright LuanRT. A client for YouTube's internal InnerTube
  API, used to look up a video's caption tracks. Pulls in `@bufbuild/protobuf` (dual
  **Apache-2.0 AND BSD-3-Clause** — both sets of terms apply), `fflate` (MIT), and `meriyah` (ISC).
- **`bgutils-js`** (`4.0.3`) — MIT, copyright LuanRT. Performs YouTube's BotGuard attestation to
  mint the proof-of-origin token that caption downloads now require. It executes an attestation
  program served by Google at runtime; that program is Google's code and is not redistributed here.
- **`jsdom`** (`30.0.1`) — MIT. Required only by the attestation step above, which runs browser
  code that expects a real DOM.

---

## 9. License texts

These are the verbatim license texts for the components that Deployable Knowledge ports into its own
source (see §6), as required by their terms.

### pyannote.audio — MIT License

Source: <https://github.com/pyannote/pyannote-audio/blob/4.0.7/LICENSE>

```text
MIT License

Copyright (c) 2020 CNRS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### SciPy — BSD-3-Clause License

Source: <https://github.com/scipy/scipy/blob/v1.16.0/LICENSE.txt>

```text
Copyright (c) 2001-2002 Enthought, Inc. 2003, SciPy Developers.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

1. Redistributions of source code must retain the above copyright
   notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above
   copyright notice, this list of conditions and the following
   disclaimer in the documentation and/or other materials provided
   with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived
   from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Silero VAD — MIT License

Source: <https://github.com/snakers4/silero-vad/blob/v6.2.3/LICENSE> (identical at v4.0)

```text
MIT License

Copyright (c) 2020-present Silero Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### SpeechBrain — Apache License 2.0

Source: <https://www.apache.org/licenses/LICENSE-2.0.txt>. SpeechBrain publishes no `NOTICE` file.

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

---

_Generated from the dependency tree resolved by `package-lock.json`. Regenerate this file when
adding a dependency that carries copyleft or use-restricted terms._
