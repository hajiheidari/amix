/**
 * Save a text file. Web: browser download. Native (Capacitor): write to the
 * app cache and open the system share sheet so the user picks a destination.
 */
export async function saveTextFile(name: string, mime: string, text: string): Promise<void> {
  if (__NATIVE__) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: res.uri, dialogTitle: name });
    return;
  }
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readTextFile(file: File): Promise<{ text: string; bytes: number }> {
  const buf = await file.arrayBuffer();
  // UTF-8 with or without BOM; invalid sequences are replaced rather than silently dropped.
  const text = new TextDecoder('utf-8').decode(buf);
  return { text, bytes: buf.byteLength };
}

export function stamp(d = new Date()): string {
  return d.toISOString().slice(0, 16).replace(/[:T]/g, '-');
}
