import type { RewriteMaterial } from './types'

/**
 * The rewrite prompt (§ prompt engineering).
 *
 * Pure and testable: it takes the collected material and returns one string.
 * The model is told, in the strongest terms, to use *only* the supplied facts —
 * the validator in `parse.ts` enforces the same rule on the way back, because a
 * prompt is a request, not a guarantee.
 */

/** The exact JSON shape the model must return, quoted verbatim in the prompt. */
export const REWRITE_JSON_SCHEMA = `{
  "title": "string — judul bahasa Indonesia, maksimal 90 karakter",
  "dek": "string — ringkasan 2 sampai 3 kalimat, maksimal 320 karakter",
  "body_markdown": "string — isi artikel 5 sampai 9 paragraf, boleh memakai sub-judul markdown (##), minimal 400 karakter",
  "image_picks": [ { "evidence_index": 0, "caption": "string — keterangan foto bahasa Indonesia" } ],
  "source_indexes": [ 0 ]
}`

export function buildPrompt(material: RewriteMaterial, options: { maxInputChars?: number } = {}): string {
  const maxChars = options.maxInputChars ?? 6000
  const body = (material.bodyText || '').slice(0, maxChars).trim()

  const images = material.images.length
    ? material.images
        .map((image, index) => `${index}. ${image.creditText || image.sourceUrl} — ${image.caption || '(tanpa keterangan)'}`)
        .join('\n')
    : '(tidak ada gambar yang tersedia)'

  const sources = material.sources
    .map((source, index) => {
      const who = source.publisherName || source.publisherDomain || 'sumber tidak dikenal'
      return `${index}. ${who} — ${source.originalTitle || '(judul tidak tersedia)'} — ${source.sourceUrl}`
    })
    .join('\n')

  return [
    'Kamu adalah admin fanbase K-Pop yang menulis artikel blog berbahasa Indonesia.',
    'Tulis ULANG materi di bawah ini menjadi satu artikel blog fanbase yang menarik, mengalir, dan enak dibaca — bukan rangkuman kering dan bukan terjemahan mentah.',
    '',
    'ATURAN WAJIB:',
    '1. Seluruh artikel berbahasa Indonesia, gaya admin fanbase: hangat dan antusias, tapi tetap faktual dan sopan.',
    '2. HANYA gunakan fakta dari materi di bawah. JANGAN mengarang kutipan, angka, tanggal, nama, atau kejadian apa pun.',
    '3. Kalau sebuah informasi tidak ada di materi, jangan disimpulkan — tulis saja bahwa hal itu belum dikonfirmasi.',
    '4. Sebutkan nama grup/artis di judul dan di paragraf pertama.',
    '5. Jangan menyalin kalimat asli kata per kata; parafrase dengan bahasamu sendiri.',
    '6. image_picks hanya boleh memakai nomor dari DAFTAR GAMBAR, dan source_indexes hanya boleh memakai nomor dari DAFTAR SUMBER.',
    '7. Jangan menuliskan URL apa pun di dalam body_markdown.',
    // A YouTube upload has no article body: say so, so the model does not
    // invent what happens inside the video.
    ...(body.length < 200
      ? ['8. Materi ini adalah unggahan video resmi — hanya judul, deskripsi, dan thumbnail yang tersedia. Jangan mengarang isi atau adegan di dalam video.']
      : []),
    '',
    'Balas HANYA dengan satu objek JSON yang valid — tanpa penjelasan tambahan, tanpa code fence markdown — dengan skema:',
    REWRITE_JSON_SCHEMA,
    '',
    '=== MATERI ===',
    `Judul asli: ${material.originalTitle}`,
    `Grup/artis: ${material.artistId}`,
    `Kategori: ${material.category}`,
    `Penerbit: ${material.publisherName || material.publisherDomain || 'tidak diketahui'}`,
    `Tanggal terbit: ${material.publishedAt || 'tidak diketahui'}`,
    `Ringkasan: ${material.summary || '(tidak ada)'}`,
    '',
    'Isi artikel asli (potongan):',
    body || '(tidak ada)',
    '',
    'DAFTAR GAMBAR:',
    images,
    '',
    'DAFTAR SUMBER:',
    sources,
  ].join('\n')
}
