<?php

/**
 * Tamil Nadu — Districts & Taluks reference data.
 *
 * Source: TN Revenue Department administrative divisions (38 districts).
 * Used to populate the District dropdown (System Admin → assigns to Admins)
 * and the Taluk dropdown (Admin → assigns to End Users, scoped to their
 * own district).
 *
 * Usage in a seeder or controller:
 *   $tn = require base_path('database/data/tn_districts_taluks.php');
 *   $tn['Madurai']; // ['Madurai North', 'Madurai South', 'Melur', ...]
 */

return [
    'Ariyalur' => ['Ariyalur', 'Udayarpalayam', 'Sendurai'],
    'Chengalpattu' => ['Chengalpattu', 'Tambaram', 'Thirukazhukundram', 'Cheyyur', 'Madurantakam'],
    'Chennai' => ['Egmore-Nungambakkam', 'Mylapore-Triplicane', 'Mambalam-Guindy', 'Fort-Tondiarpet', 'Perambur-Purasawalkam'],
    'Coimbatore' => ['Coimbatore North', 'Coimbatore South', 'Mettupalayam', 'Sulur', 'Pollachi', 'Valparai', 'Annur', 'Kinathukadavu'],
    'Cuddalore' => ['Cuddalore', 'Panruti', 'Chidambaram', 'Kattumannarkoil', 'Vriddhachalam', 'Tittakudi'],
    'Dharmapuri' => ['Dharmapuri', 'Palacode', 'Pennagaram', 'Harur', 'Pappireddipatti'],
    'Dindigul' => ['Dindigul', 'Palani', 'Kodaikanal', 'Oddanchatram', 'Natham', 'Vedasandur', 'Nilakottai'],
    'Erode' => ['Erode', 'Bhavani', 'Gobichettipalayam', 'Perundurai', 'Sathyamangalam', 'Modakkurichi'],
    'Kallakurichi' => ['Kallakurichi', 'Sankarapuram', 'Tirukoilur', 'Ulundurpet'],
    'Kanchipuram' => ['Kanchipuram', 'Sriperumbudur', 'Uthiramerur', 'Walajabad'],
    'Kanniyakumari' => ['Agastheeswaram', 'Kalkulam', 'Vilavancode', 'Thovalai'],
    'Karur' => ['Karur', 'Aravakurichi', 'Krishnarayapuram', 'Kulithalai'],
    'Krishnagiri' => ['Krishnagiri', 'Hosur', 'Pochampalli', 'Uthangarai', 'Denkanikottai'],
    'Madurai' => ['Madurai North', 'Madurai South', 'Melur', 'Tirumangalam', 'Periyur', 'Usilampatti', 'Vadipatti', 'Thirupparankundram'],
    'Mayiladuthurai' => ['Mayiladuthurai', 'Sirkazhi', 'Tharangambadi', 'Kuthalam'],
    'Nagapattinam' => ['Nagapattinam', 'Kilvelur', 'Vedaranyam', 'Thirukkuvalai'],
    'Namakkal' => ['Namakkal', 'Tiruchengode', 'Rasipuram', 'Paramathi-Velur', 'Kolli Hills'],
    'Nilgiris' => ['Udhagamandalam (Ooty)', 'Coonoor', 'Kotagiri', 'Gudalur', 'Pandalur'],
    'Perambalur' => ['Perambalur', 'Kunnam', 'Veppanthattai'],
    'Pudukkottai' => ['Pudukkottai', 'Alangudi', 'Aranthangi', 'Thirumayam', 'Gandarvakottai'],
    'Ramanathapuram' => ['Ramanathapuram', 'Rameswaram', 'Paramakudi', 'Tiruvadanai', 'Kamuthi', 'Mudukulathur'],
    'Ranipet' => ['Ranipet', 'Arakkonam', 'Arcot', 'Walajapet', 'Nemili'],
    'Salem' => ['Salem', 'Attur', 'Mettur', 'Omalur', 'Edappadi', 'Sankari', 'Yercaud'],
    'Sivaganga' => ['Sivaganga', 'Karaikudi', 'Manamadurai', 'Devakottai', 'Tirupattur (Sivaganga)', 'Ilayangudi'],
    'Tenkasi' => ['Tenkasi', 'Sankarankovil', 'Shenkottai', 'Kadayanallur', 'Vasudevanallur'],
    'Thanjavur' => ['Thanjavur', 'Kumbakonam', 'Pattukkottai', 'Orathanadu', 'Papanasam', 'Peravurani'],
    'Theni' => ['Theni', 'Bodinayakanur', 'Periyakulam', 'Uthamapalayam', 'Andipatti'],
    'Thoothukudi' => ['Thoothukudi', 'Ottapidaram', 'Tiruchendur', 'Kovilpatti', 'Vilathikulam', 'Srivaikuntam'],
    'Tiruchirappalli' => ['Tiruchirappalli (Trichy)', 'Srirangam', 'Lalgudi', 'Manapparai', 'Musiri', 'Thuraiyur'],
    'Tirunelveli' => ['Tirunelveli', 'Ambasamudram', 'Nanguneri', 'Palayamkottai', 'Radhapuram', 'Sankarankovil'],
    'Tirupathur' => ['Tirupathur', 'Vaniyambadi', 'Ambur', 'Natrampalli'],
    'Tiruppur' => ['Tiruppur North', 'Tiruppur South', 'Avinashi', 'Dharapuram', 'Palladam', 'Udumalaipettai', 'Kangeyam'],
    'Tiruvallur' => ['Tiruvallur', 'Poonamallee', 'Ponneri', 'Gummidipoondi', 'Uthukottai', 'Pallipattu'],
    'Tiruvannamalai' => ['Tiruvannamalai', 'Arani', 'Vandavasi', 'Cheyyar', 'Polur', 'Chengam', 'Kilpennathur'],
    'Tiruvarur' => ['Tiruvarur', 'Nannilam', 'Mannargudi', 'Needamangalam', 'Thiruthuraipoondi', 'Kudavasal'],
    'Vellore' => ['Vellore', 'Gudiyatham', 'Katpadi', 'Anaicut', 'K.V. Kuppam'],
    'Viluppuram' => ['Viluppuram', 'Tindivanam', 'Gingee', 'Vanur', 'Vikravandi'],
    'Virudhunagar' => ['Virudhunagar', 'Sivakasi', 'Srivilliputhur', 'Rajapalayam', 'Aruppukottai', 'Sattur', 'Tiruchuli'],
];
