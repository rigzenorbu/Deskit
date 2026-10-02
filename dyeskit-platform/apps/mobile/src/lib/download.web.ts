/** Web version of download.ts: an ordinary browser download. */
export async function saveText(filename: string, text: string, mimeType = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
