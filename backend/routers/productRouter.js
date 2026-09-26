const express = require('express');
const { searchStore, getProductOptions, trackProduct, listTracked, untrack } = require('../controllers/ProductControllers');

const router = express.Router();

router.get('/search-store', searchStore);
router.get('/product-options', getProductOptions);
router.post('/track-product', trackProduct);
router.get('/list-tracked', listTracked);
router.delete('/untrack-product/:id', untrack);

module.exports = router;
