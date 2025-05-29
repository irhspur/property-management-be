const express = require('express');
const router = express.Router();
const {getAllMunicipalities, getMunicipalityById, createMunicipality, updateMunicipality, deleteMunicipality} = require('../controllers/municipalityController');
// Get all municipalities
router.get('/', getAllMunicipalities);
// Get a municipality by ID
router.get('/:id', getMunicipalityById);
// Create a new municipality
router.post('/', createMunicipality);
// Update a municipality by ID
router.put('/:id', updateMunicipality);
// Delete a municipality by ID
router.delete('/:id', deleteMunicipality);
// Export the router
module.exports = router;
