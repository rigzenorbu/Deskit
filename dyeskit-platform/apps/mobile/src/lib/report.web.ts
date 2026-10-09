/** Web version of report.ts: open the report in its own window and print it (or save as PDF). */
import { api, qs } from './api';

export async function shareReport(params: { village_id?: number; district?: string; round?: string }) {
  const win = window.open('', '_blank');           // opened at once, so the browser does not block it
  const html = await api<string>('/api/report' + qs(params), { raw: true });
  if (!win) throw new Error('Allow pop-ups for this site to open the report.');
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* the window was closed */ } }, 600);
}
