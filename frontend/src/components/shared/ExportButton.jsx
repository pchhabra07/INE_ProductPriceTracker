import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

const SERVER = import.meta.env.VITE_SERVER_URL;

// CSV export trigger button — downloads from /export/export-history-csv
export default function ExportButton() {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SERVER}/export/export-history-csv`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `price-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={handleExport}
      disabled={loading}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="spin-icon" />
          <span>Exporting…</span>
        </>
      ) : (
        <>
          <Download size={16} />
          <span>Export CSV</span>
        </>
      )}
    </button>
  );
}
