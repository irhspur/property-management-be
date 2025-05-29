const express = require('express');
const router = express.Router();
const { getAllGenders, createGender, updateGender, deleteGender } = require('../controllers/genderController');
router.get('/', getAllGenders);
router.post('/', createGender);
router.put('/:id', updateGender);
router.delete('/:id', deleteGender);
module.exports = router;
