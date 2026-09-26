const express = require('express');
const { runScheduledScrape, scrapeNow, getProductHistory } = require('../controllers/ScrapeControllers');

const router = express.Router();

router.get('/run-scheduled-scrape', runScheduledScrape);
router.post('/run-scheduled-scrape', runScheduledScrape);
router.post('/scrape-now/:trackedProductId', scrapeNow);
router.get('/product-history/:trackedProductId', getProductHistory);

module.exports = router;
