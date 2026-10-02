/** Save text to a file and open the share sheet (WhatsApp, email, Drive…). */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveText(filename: string, text: string, mimeType = 'text/csv') {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
