import { Router, Request, Response } from 'express';
import { runScanCycle, scanSingleSet } from '../services/scanner.js';
import { filterListing, calculateListingQualityScore } from '../utils/listingFilter.js';
import { getSet } from '../services/sets.js';

const router = Router();

router.post('/run', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('Manual scan triggered');
    const result = await runScanCycle();
    res.json(result);
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      error: 'Scan failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/test', async (req: Request, res: Response): Promise<void> => {
  try {
    const { setNumber, shipToCountry } = req.body;

    if (!setNumber || !shipToCountry) {
      res.status(400).json({
        error: 'Missing required fields: setNumber, shipToCountry',
      });
      return;
    }

    console.log(`Test scan: ${setNumber} -> ${shipToCountry}`);
    
    // Get set name for filtering
    const setInfo = await getSet(setNumber);
    const setName = setInfo?.name ?? null;
    
    const listings = await scanSingleSet(setNumber, shipToCountry);

    // Apply quality filter and show results
    const filteredListings = listings.map(l => {
      const filterResult = filterListing(l.title, setNumber, setName, l.total_eur);
      const qualityScore = calculateListingQualityScore(l.title, setNumber, setName, l.total_eur);
      
      return {
        ...l,
        _filter: {
          passed: filterResult.passed,
          reason: filterResult.reason,
          qualityScore,
          setNameUsed: setName,
        },
      };
    });

    // Separate passed and rejected
    const passed = filteredListings.filter(l => l._filter.passed);
    const rejected = filteredListings.filter(l => !l._filter.passed);

    res.json({
      setNumber,
      setName,
      shipToCountry,
      totalFound: listings.length,
      passedFilter: passed.length,
      rejectedByFilter: rejected.length,
      passed: passed.slice(0, 20), // Top 20 that passed
      rejected: rejected.slice(0, 10), // Sample of rejected (for debugging)
    });
  } catch (error) {
    console.error('Test scan error:', error);
    res.status(500).json({
      error: 'Test scan failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test the filter on a specific title (for debugging)
 * POST /api/scan/test-filter
 * Body: { setNumber: "75005", title: "LEGO Star Wars...", price: 350 }
 */
router.post('/test-filter', async (req: Request, res: Response): Promise<void> => {
  try {
    const { setNumber, title, price } = req.body;

    if (!setNumber || !title) {
      res.status(400).json({
        error: 'Missing required fields: setNumber, title',
      });
      return;
    }

    const setInfo = await getSet(setNumber);
    const setName = setInfo?.name ?? null;
    const priceNum = Number(price) || 100;

    const filterResult = filterListing(title, setNumber, setName, priceNum);
    const qualityScore = calculateListingQualityScore(title, setNumber, setName, priceNum);

    res.json({
      setNumber,
      setName,
      title,
      price: priceNum,
      filter: {
        passed: filterResult.passed,
        reason: filterResult.reason,
        qualityScore,
      },
    });
  } catch (error) {
    console.error('Test filter error:', error);
    res.status(500).json({
      error: 'Test filter failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
