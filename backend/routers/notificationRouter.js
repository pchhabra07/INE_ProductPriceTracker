const express = require('express');
const router = express.Router();
const {
  listNotifications,
  countUnread,
  markAsRead,
  markAllAsRead,
} = require('../models/Notification');

// GET /notifications
// Returns all notifications (newest first), up to 50.
// Pass ?unread=true to return only unread ones.
router.get('/', async (req, res, next) => {
  try {
    const unreadOnly = req.query.unread === 'true';
    const notifications = await listNotifications({ unreadOnly });
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

// GET /notifications/count
// Returns { count: number } — unread notification count for the bell badge.
router.get('/count', async (req, res, next) => {
  try {
    const count = await countUnread();
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/:id/read
// Mark a single notification as read.
router.patch('/:id/read', async (req, res, next) => {
  try {
    await markAsRead(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /notifications/read-all
// Mark all notifications as read.
router.patch('/read-all', async (req, res, next) => {
  try {
    await markAllAsRead();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
