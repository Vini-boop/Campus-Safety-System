// Zone accuracy test — mirrors placeIntelligenceService.ts best-fit resolver
var zones = [
    { name: 'Table Land', latMin: 0.034319, latMax: 0.037913, lngMin: 36.265675, lngMax: 36.268546, snapRadius: 0 },
    { name: 'Jaffa Hostels', latMin: 0.035692, latMax: 0.036692, lngMin: 36.271168, lngMax: 36.272168, snapRadius: 0 },
    { name: 'Alexander Hostels', latMin: 0.036609, latMax: 0.037609, lngMin: 36.274486, lngMax: 36.275486, snapRadius: 0 },
    { name: 'Shamenei', latMin: 0.041446, latMax: 0.044561, lngMin: 36.276880, lngMax: 36.280790, snapRadius: 0 },
    { name: 'Ndoro A Hostels', latMin: 0.012293, latMax: 0.013293, lngMin: 36.272300, lngMax: 36.273300, snapRadius: 200 },
    { name: 'Nyumba Tatu', latMin: 0.032963, latMax: 0.039000, lngMin: 36.285800, lngMax: 36.290500, snapRadius: 0 },
    { name: 'Cherika Junction', latMin: 0.028482, latMax: 0.034500, lngMin: 36.281500, lngMax: 36.285700, snapRadius: 0 },
    { name: 'Two Brothers', latMin: 0.032528, latMax: 0.036004, lngMin: 36.290368, lngMax: 36.292473, snapRadius: 0 },
    { name: 'Comrades Hostels', latMin: 0.036159, latMax: 0.038191, lngMin: 36.289746, lngMax: 36.291700, snapRadius: 0 },
    { name: 'Tairi Mbili', latMin: 0.037261, latMax: 0.042409, lngMin: 36.291585, lngMax: 36.294983, snapRadius: 0 },
    { name: 'Karuga Town', latMin: 0.036319, latMax: 0.044240, lngMin: 36.296217, lngMax: 36.300139, snapRadius: 0 },
    { name: 'Gavana Hostels', latMin: 0.040806, latMax: 0.043945, lngMin: 36.305275, lngMax: 36.312738, snapRadius: 0 },
    { name: 'Security Department', latMin: 0.027715, latMax: 0.028215, lngMin: 36.277044, lngMax: 36.277544, snapRadius: 60 },
    { name: 'Farm Department', latMin: 0.027772, latMax: 0.028772, lngMin: 36.277355, lngMax: 36.278355, snapRadius: 60 },
    { name: 'University Hospital', latMin: 0.027923, latMax: 0.028923, lngMin: 36.272789, lngMax: 36.273789, snapRadius: 60 },
    { name: 'LU Radio', latMin: 0.028298, latMax: 0.028798, lngMin: 36.272306, lngMax: 36.272806, snapRadius: 40 },
    { name: 'Dean of Students Office', latMin: 0.028213, latMax: 0.028713, lngMin: 36.272682, lngMax: 36.273182, snapRadius: 40 },
    { name: 'Registrar Office', latMin: 0.029200, latMax: 0.029700, lngMin: 36.274184, lngMax: 36.274684, snapRadius: 40 },
    { name: 'Mandela Hall', latMin: 0.031310, latMax: 0.032310, lngMin: 36.272446, lngMax: 36.273446, snapRadius: 0 },
    { name: 'Nyando Hostel', latMin: 0.028110, latMax: 0.029110, lngMin: 36.274623, lngMax: 36.275623, snapRadius: 0 },
    { name: 'Niger Hostel', latMin: 0.028645, latMax: 0.029645, lngMin: 36.274693, lngMax: 36.275693, snapRadius: 0 },
    { name: 'Malewa Hostel', latMin: 0.028667, latMax: 0.029667, lngMin: 36.274891, lngMax: 36.275891, snapRadius: 0 },
    { name: 'Sabaki Hostel', latMin: 0.028972, latMax: 0.029972, lngMin: 36.274611, lngMax: 36.275611, snapRadius: 0 },
    { name: 'Ngarenarok Hostel', latMin: 0.029073, latMax: 0.030073, lngMin: 36.274814, lngMax: 36.275814, snapRadius: 0 },
    { name: 'Chania Hostel', latMin: 0.028762, latMax: 0.029762, lngMin: 36.275053, lngMax: 36.276053, snapRadius: 0 },
    { name: 'Lake Chacha', latMin: 0.028134, latMax: 0.029134, lngMin: 36.276027, lngMax: 36.277027, snapRadius: 0 },
    { name: 'Computing & Informatics', latMin: 0.028096, latMax: 0.029096, lngMin: 36.273199, lngMax: 36.274199, snapRadius: 0 },
    { name: 'Computer Lab', latMin: 0.028806, latMax: 0.029806, lngMin: 36.273306, lngMax: 36.274306, snapRadius: 0 },
    { name: 'Pavilion', latMin: 0.029961, latMax: 0.030961, lngMin: 36.273941, lngMax: 36.274941, snapRadius: 0 },
    { name: 'New Library', latMin: 0.030104, latMax: 0.031104, lngMin: 36.272208, lngMax: 36.273208, snapRadius: 0 },
    { name: 'Vision 2030 Block', latMin: 0.030494, latMax: 0.031494, lngMin: 36.272991, lngMax: 36.273991, snapRadius: 0 },
    { name: 'Football Pitch A', latMin: 0.031294, latMax: 0.032294, lngMin: 36.274337, lngMax: 36.275337, snapRadius: 0 },
];

var pins = [
    [0.036116, 36.267111, 'Table Land'],
    [0.036192, 36.271668, 'Jaffa Hostels'],
    [0.037109, 36.274986, 'Alexander Hostels'],
    [0.043004, 36.278835, 'Shamenei'],
    [0.012793, 36.272800, 'Ndoro A Hostels'],
    [0.035774, 36.287639, 'Nyumba Tatu'],
    [0.032408, 36.283966, 'Cherika Junction'],
    [0.034266, 36.291421, 'Two Brothers'],
    [0.037175, 36.290723, 'Comrades Hostels'],
    [0.039835, 36.293284, 'Tairi Mbili'],
    [0.040280, 36.298178, 'Karuga Town'],
    [0.042376, 36.309007, 'Gavana Hostels'],
    [0.027965, 36.277294, 'Security Department'],
    [0.028272, 36.277855, 'Farm Department'],
    [0.028423, 36.273289, 'University Hospital'],
    [0.028548, 36.272556, 'LU Radio'],
    [0.028463, 36.272932, 'Dean of Students Office'],
    [0.029450, 36.274434, 'Registrar Office'],
    [0.031810, 36.272946, 'Mandela Hall'],
    [0.028610, 36.275123, 'Nyando Hostel'],
    [0.029145, 36.275193, 'Niger Hostel'],
    [0.029167, 36.275391, 'Malewa Hostel'],
    [0.029472, 36.275111, 'Sabaki Hostel'],
    [0.029573, 36.275314, 'Ngarenarok Hostel'],
    [0.029262, 36.275553, 'Chania Hostel'],
    [0.028634, 36.276527, 'Lake Chacha'],
    [0.028596, 36.273699, 'Computing & Informatics'],
    [0.029306, 36.273806, 'Computer Lab'],
    [0.030461, 36.274441, 'Pavilion'],
    [0.030604, 36.272708, 'New Library'],
    [0.030994, 36.273491, 'Vision 2030 Block'],
    [0.031794, 36.274837, 'Football Pitch A'],
];

var mToDeg = function (m) { return m / 111320; };
var BUFFER = 0.0005;
var pass = 0, fail = 0;

// Best-fit resolver: collect all matching zones, pick smallest area
function resolve(lat, lng) {
    var matches = [];
    for (var i = 0; i < zones.length; i++) {
        var z = zones[i];
        var buf = z.snapRadius > 0 ? mToDeg(z.snapRadius) : BUFFER;
        if (lat >= z.latMin - buf && lat <= z.latMax + buf && lng >= z.lngMin - buf && lng <= z.lngMax + buf) {
            var latSpan = (z.latMax - z.latMin) + 2 * buf;
            var lngSpan = (z.lngMax - z.lngMin) + 2 * buf;
            matches.push({ name: z.name, area: latSpan * lngSpan });
        }
    }
    if (matches.length === 0) return null;
    matches.sort(function (a, b) { return a.area - b.area; });
    return matches[0].name;
}

pins.forEach(function (entry) {
    var lat = entry[0], lng = entry[1], expected = entry[2];
    var resolved = resolve(lat, lng);
    if (resolved === expected) {
        pass++;
        console.log('OK   ' + expected);
    } else {
        fail++;
        console.log('FAIL ' + expected + ' => got ' + (resolved || 'NEAREST_MATCH'));
    }
});

console.log('\n=== ' + pass + '/' + pins.length + ' pass, ' + fail + ' fail ===');
