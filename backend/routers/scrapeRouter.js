const express = require('express');
const { runScheduledScrape, scrapeNow, getProductHistory, getProductLog } = require('../controllers/ScrapeControllers');

const router = express.Router();

router.post('/run-scheduled-scrape', runScheduledScrape);
router.post('/scrape-now/:trackedProductId', scrapeNow);
router.get('/product-history/:trackedProductId', getProductHistory);
router.get('/product-log/:trackedProductId', getProductLog);

module.exports = router;
