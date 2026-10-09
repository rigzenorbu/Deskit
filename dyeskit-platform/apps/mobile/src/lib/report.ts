/** Village and district reports: built by the server, turned into a PDF on the phone and shared. */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api, qs } from './api';

export async function shareReport(params: { village_id?: number; district?: string; round?: string }) {
  const html = await api<string>('/api/report' + qs(params), { raw: true });
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });   // A4
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Well-being report' });
  else await Print.printAsync({ uri });
}
