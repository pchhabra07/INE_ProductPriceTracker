const express = require('express');
const { exportHistoryCsv } = require('../controllers/ExportControllers');

const router = express.Router();

router.get('/export-history-csv', exportHistoryCsv);

module.exports = router;
