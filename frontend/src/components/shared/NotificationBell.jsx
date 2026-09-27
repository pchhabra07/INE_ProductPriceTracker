import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, CheckCheck, TrendingDown, PackageCheck, AlertTriangle, X } from 'lucide-react';

const SERVER = import.meta.env.VITE_SERVER_URL;
const POLL_INTERVAL_MS = 60_000; // poll every 60 seconds

const TYPE_META = {
  price_drop:        { icon: TrendingDown,   label: 'Price Drop',      colorClass: 'notif-price-drop' },
  back_in_stock:     { icon: PackageCheck,   label: 'Back in Stock',   colorClass: 'notif-back-in-stock' },
  structure_changed: { icon: AlertTriangle,  label: 'Page Changed',    colorClass: 'notif-structure' },
};

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [open, setOpen]                   = useState(false);
  const [loading, setLoading]             = useState(false);
  const panelRef = useRef(null);

  // ── Fetch unread count (lightweight, background poll) ─────────────────────
  const fetchCount = useCallback(async () => {
    try {
      const res  = await fetch(`${SERVER}/notifications/count`);
      const data = await res.json();
      setUnreadCount(data.count ?? 0);
    } catch {
      // Silently swallow — don't interrupt UX for a badge poll
    }
  }, []);

  // ── Fetch full notification list (only when panel is opened) ──────────────
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${SERVER}/notifications`);
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    } catch {
      // Silently swallow
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll count every 60s
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchCount]);

  // Fetch full list when panel opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Mark one as read ──────────────────────────────────────────────────────
  const markRead = async (id) => {
    try {
      await fetch(`${SERVER}/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  // ── Mark all as read ─────────────────────────────────────────────────────
  const markAllRead = async () => {
    try {
      await fetch(`${SERVER}/notifications/read-all`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {}
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        className={`notif-bell-btn${unreadCount > 0 ? ' has-unread' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        title="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications panel">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            <div className="notif-panel-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="notif-mark-all-btn"
                  onClick={markAllRead}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                className="notif-close-btn"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="notif-panel-body">
            {loading && (
              <div className="notif-empty">
                <div className="spinner" style={{ width: '20px', height: '20px' }} />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="notif-empty">
                <Bell size={28} strokeWidth={1.5} />
                <p>No notifications yet</p>
                <span>Price drops and stock alerts will appear here</span>
              </div>
            )}

            {!loading && notifications.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.structure_changed;
              const Icon = meta.icon;
              return (
                <div
                  key={n.id}
                  className={`notif-item${n.is_read ? ' is-read' : ''}${' ' + meta.colorClass}`}
                  onClick={() => !n.is_read && markRead(n.id)}
                  role={n.is_read ? undefined : 'button'}
                  tabIndex={n.is_read ? undefined : 0}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !n.is_read) markRead(n.id); }}
                  title={n.is_read ? undefined : 'Click to mark as read'}
                >
                  <div className="notif-item-icon">
                    <Icon size={15} strokeWidth={2} />
                  </div>
                  <div className="notif-item-content">
                    <div className="notif-item-type">{meta.label}</div>
                    <p className="notif-item-msg">{n.message}</p>
                    {n.old_value && n.new_value && (
                      <div className="notif-item-values">
                        <span className="notif-old">{n.old_value}</span>
                        <span className="notif-arrow">→</span>
                        <span className="notif-new">{n.new_value}</span>
                      </div>
                    )}
                    <span className="notif-item-time">
                      {formatRelativeTime(n.created_at)}
                      {n.tracked_products && (
                        <> · {n.tracked_products.product_name}</>
                      )}
                    </span>
                  </div>
                  {!n.is_read && <div className="notif-unread-dot" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
