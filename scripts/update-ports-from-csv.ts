// scripts/update-ports-from-csv.ts
import * as fs from 'fs';
import * as path from 'path';

// Port name to UNLO code mapping (common ports)
const portNameToCode: Record<string, string> = {
  'Singapore': 'SGSIN',
  'Hong Kong': 'HKHKG',
  'Busan': 'KRBUS',
  'Shanghai': 'CNSHA',
  'Tokyo': 'JPTYO',
  'Yokohama': 'JPYOK',
  'Ulsan': 'KRUSN',
  'Ningbo': 'CNNGB',
  'Qingdao': 'CNTAO',
  'Tianjin': 'CNTXG',
  'Dalian': 'CNDLC',
  'Guangzhou': 'CNCAN',
  'Shenzhen': 'CNSZN',
  'Mumbai': 'INMUN',
  'Chennai': 'INMAA',
  'Kandla': 'INIXY',
  'Visakhapatnam': 'INVTZ',
  'Colombo': 'LKCMB',
  'Chittagong': 'BDCGP',
  'Bangkok': 'THBKK',
  'Laem Chabang': 'THLCH',
  'Ho Chi Minh City': 'VNSGN',
  'Manila': 'PHMNL',
  'Jakarta': 'IDJKT',
  'Surabaya': 'IDSUB',
  'Rotterdam': 'NLRTM',
  'Amsterdam': 'NLAMS',
  'Antwerp': 'BEANR',
  'Hamburg': 'DEHAM',
  'Bremen': 'DEBRE',
  'London': 'GBLON',
  'Felixstowe': 'GBFEL',
  'Le Havre': 'FRLEH',
  'Marseille': 'FRMRS',
  'Barcelona': 'ESBCN',
  'Valencia': 'ESVLC',
  'Genoa': 'ITGOA',
  'Naples': 'ITNAP',
  'Piraeus': 'GRPIR',
  'Istanbul': 'TRIST',
  'Dubai': 'AEDXB',
  'Fujairah': 'AEFJR',
  'Jebel Ali': 'AEJEA',
  'Port Said': 'EGPSD',
  'Suez': 'EGSUZ',
  'Aden': 'YEADE',
  'Djibouti': 'DJJIB',
  'Mombasa': 'KEMBA',
  'Durban': 'ZADUR',
  'Cape Town': 'ZACPT',
  'Houston': 'USHOU',
  'New York': 'USNYC',
  'Los Angeles': 'USLAX',
  'Long Beach': 'USLGB',
  'San Francisco': 'USSFO',
  'Seattle': 'USSEA',
  'Miami': 'USMIA',
  'New Orleans': 'USMSY',
  'Savannah': 'USSAV',
  'Charleston': 'USCHS',
  'Norfolk': 'USORF',
  'Baltimore': 'USBWI',
  'Philadelphia': 'USPHL',
  'Boston': 'USBOS',
  'Portland': 'USPDX',
  'Tacoma': 'USTIW',
  'Vancouver': 'CAVAN',
  'Montreal': 'CAMTR',
  'Halifax': 'CAHAL',
  'Buenos Aires': 'ARBUE',
  'Rio de Janeiro': 'BRRIO',
  'Santos': 'BRSTS',
  'Paranagua': 'BRPNG',
  'Itajai': 'BRITJ',
  'Rio Grande': 'BRRIG',
  'Valparaiso': 'CLVAP',
  'Callao': 'PECLL',
  'Guayaquil': 'ECGYE',
  'Cartagena': 'COCTG',
  'Buenaventura': 'COBUN',
  'Panama City': 'PAPTY',
  'Cristobal': 'PACTB',
  'Kingston': 'JMKIN',
  'Havana': 'CUHAV',
  'Santo Domingo': 'DOSDQ',
  'San Juan': 'PRSJU',
  'Gibraltar': 'GIGIB',
  'Las Palmas': 'ESLPA',
  'Tenerife': 'ESTFU',
  'Dakar': 'SNDKR',
  'Abidjan': 'CIABJ',
  'Lagos': 'NGLOS',
  'Tema': 'GHTEM',
  'Lome': 'TGLFW',
  'Cotonou': 'BJCOO',
  'Douala': 'CMDLA',
  'Pointe Noire': 'CGPNR',
  'Luanda': 'AOLAD',
  'Walvis Bay': 'NAWVB',
  'Port Elizabeth': 'ZAPLZ',
  'East London': 'ZAELS',
  'Richards Bay': 'ZARCB',
  'Maputo': 'MZMPM',
  'Beira': 'MZBEW',
  'Dar es Salaam': 'TZDAR',
  'Zanzibar': 'TZZNZ',
  'Port Louis': 'MUPLU',
  'Port Victoria': 'SCPOV',
  'Male': 'MVMLE',
  'Port Blair': 'INIXZ',
  'Port Klang': 'MYPKG',
  'Penang': 'MYPNG',
  'Johor Bahru': 'MYJHB',
  'Bintulu': 'MYBTU',
  'Kuching': 'MYKCH',
  'Kota Kinabalu': 'MYKKI',
  'Labuan': 'MYLBU',
  'Sandakan': 'MYSDK',
  'Tawau': 'MYTWU',
  'Sibu': 'MYSBW',
  'Miri': 'MYMYY',
  'Langkawi': 'MYLGK',
  'Lumut': 'MYLUM',
  'Kuantan': 'MYKUA',
  'Kemaman': 'MYKEM',
  'Tanjung Pelepas': 'MYTPP',
  'Pasir Gudang': 'MYPGU',
  'Tanjung Berhala': 'MYTJB',
  'Tanjung Langsat': 'MYTLS',
  'Tanjung Bin': 'MYTJB',
  'Pulau Indah': 'MYPUI',
  'Westport': 'MYWSP',
  'Northport': 'MYNPT',
  'Southport': 'MYSPT',
  'Busan New Port': 'KRBNP',
  'Incheon': 'KRINC',
  'Gwangyang': 'KRKWJ',
  'Pohang': 'KRKPO',
  'Ulsan': 'KRUSN',
  'Mokpo': 'KRMOK',
  'Yeosu': 'KRYOS',
  'Mas': 'KRMAS',
  'Okpo': 'KROKP',
  'Geoje': 'KRGJE',
  'Tongyeong': 'KRTYG',
  'Sacheon': 'KRSAE',
  'Jinhae': 'KRJHA',
  'Samcheonpo': 'KRSAM',
  'Hadong': 'KRHAD',
  'Suncheon': 'KRSUN',
  'Gunsan': 'KRKUV',
  'Jeju': 'KRJNU',
  'Seoul': 'KRSEL',
  'Daesan': 'KRDSN',
  'Onsan': 'KRONS',
  'Dangjin': 'KRDJI',
  'Pyeongtaek': 'KRPTK',
  'Donghae': 'KRDOH',
  'Mukho': 'KRMHO',
  'Samcheok': 'KRSMC',
  'Ulleung': 'KRULN',
  'Sokcho': 'KRSCK',
  'Gangneung': 'KRKAG',
  'Dongmak': 'KRDMA',
  'Boryeong': 'KRBRY',
  'Taean': 'KRTAE',
  'Anmyeon': 'KRAMY',
  'Buan': 'KRBUA',
  'Gochang': 'KRGOC',
  'Muan': 'KRMUA',
  'Haenam': 'KRHAN',
  'Wando': 'KRWDO',
  'Jindo': 'KRJIN',
  'Sinan': 'KRSIN',
  'Shinan': 'KRSHN',
  'Jangseong': 'KRJSE',
  'Gurye': 'KRGRY',
  'Hampyeong': 'KRHPY',
  'Yeonggwang': 'KRYGG',
  'Goheung': 'KRGHG',
  'Boseong': 'KRBSG',
  'Jangheung': 'KRJHG',
  'Gangjin': 'KRGJN',
  'Wando': 'KRWND',
  'Jindo': 'KRJND',
  'Sinan': 'KRSNA',
  'Haenam': 'KRHNM',
  'Muan': 'KRMUN',
  'Buan': 'KRBUN',
  'Gochang': 'KRGCH',
  'Anmyeon': 'KRAMN',
  'Taean': 'KRTAN',
  'Boryeong': 'KRBRG',
  'Dongmak': 'KRDNG',
  'Gangneung': 'KRGNG',
  'Sokcho': 'KRSKC',
  'Ulleung': 'KRULG',
  'Samcheok': 'KRSMC',
  'Donghae': 'KRDHH',
  'Pyeongtaek': 'KRPTK',
  'Dangjin': 'KRDJN',
  'Onsan': 'KRONS',
  'Daesan': 'KRDSN',
  'Seoul': 'KRSEL',
  'Jeju': 'KRJNU',
  'Gunsan': 'KRKSN',
  'Suncheon': 'KRSNC',
  'Hadong': 'KRHAD',
  'Samcheonpo': 'KRSAM',
  'Jinhae': 'KRJHA',
  'Sacheon': 'KRSAE',
  'Tongyeong': 'KRTYG',
  'Geoje': 'KRGJE',
  'Okpo': 'KROKP',
  'Mas': 'KRMAS',
  'Yeosu': 'KRYOS',
  'Mokpo': 'KRMOK',
  'Ulsan': 'KRUSN',
  'Pohang': 'KRKPO',
  'Gwangyang': 'KRKWJ',
  'Incheon': 'KRINC',
  'Busan New Port': 'KRBNP',
  'Westport': 'MYWSP',
  'Northport': 'MYNPT',
  'Southport': 'MYSPT',
  'Pulau Indah': 'MYPUI',
  'Tanjung Bin': 'MYTJB',
  'Tanjung Langsat': 'MYTLS',
  'Tanjung Berhala': 'MYTJB',
  'Pasir Gudang': 'MYPGU',
  'Tanjung Pelepas': 'MYTPP',
  'Kemaman': 'MYKEM',
  'Kuantan': 'MYKUA',
  'Lumut': 'MYLUM',
  'Langkawi': 'MYLGK',
  'Miri': 'MYMYY',
  'Sibu': 'MYSBW',
  'Tawau': 'MYTWU',
  'Sandakan': 'MYSDK',
  'Labuan': 'MYLBU',
  'Kota Kinabalu': 'MYKKI',
  'Kuching': 'MYKCH',
  'Bintulu': 'MYBTU',
  'Johor Bahru': 'MYJHB',
  'Penang': 'MYPNG',
  'Port Klang': 'MYPKG',
  'Port Blair': 'INIXZ',
  'Male': 'MVMLE',
  'Port Victoria': 'SCPOV',
  'Port Louis': 'MUPLU',
  'Zanzibar': 'TZZNZ',
  'Dar es Salaam': 'TZDAR',
  'Beira': 'MZBEW',
  'Maputo': 'MZMPM',
  'Richards Bay': 'ZARCB',
  'East London': 'ZAELS',
  'Port Elizabeth': 'ZAPLZ',
  'Walvis Bay': 'NAWVB',
  'Luanda': 'AOLAD',
  'Pointe Noire': 'CGPNR',
  'Douala': 'CMDLA',
  'Cotonou': 'BJCOO',
  'Lome': 'TGLFW',
  'Tema': 'GHTEM',
  'Lagos': 'NGLOS',
  'Abidjan': 'CIABJ',
  'Dakar': 'SNDKR',
  'Tenerife': 'ESTFU',
  'Las Palmas': 'ESLPA',
  'Gibraltar': 'GIGIB',
  'San Juan': 'PRSJU',
  'Santo Domingo': 'DOSDQ',
  'Havana': 'CUHAV',
  'Kingston': 'JMKIN',
  'Cristobal': 'PACTB',
  'Panama City': 'PAPTY',
  'Buenaventura': 'COBUN',
  'Cartagena': 'COCTG',
  'Guayaquil': 'ECGYE',
  'Callao': 'PECLL',
  'Valparaiso': 'CLVAP',
  'Rio Grande': 'BRRIG',
  'Itajai': 'BRITJ',
  'Paranagua': 'BRPNG',
  'Santos': 'BRSTS',
  'Rio de Janeiro': 'BRRIO',
  'Buenos Aires': 'ARBUE',
  'Halifax': 'CAHAL',
  'Montreal': 'CAMTR',
  'Vancouver': 'CAVAN',
  'Tacoma': 'USTIW',
  'Portland': 'USPDX',
  'Boston': 'USBOS',
  'Philadelphia': 'USPHL',
  'Baltimore': 'USBWI',
  'Norfolk': 'USORF',
  'Charleston': 'USCHS',
  'Savannah': 'USSAV',
  'New Orleans': 'USMSY',
  'Miami': 'USMIA',
  'Seattle': 'USSEA',
  'San Francisco': 'USSFO',
  'Long Beach': 'USLGB',
  'Los Angeles': 'USLAX',
  'New York': 'USNYC',
  'Houston': 'USHOU',
  'Cape Town': 'ZACPT',
  'Durban': 'ZADUR',
  'Mombasa': 'KEMBA',
  'Djibouti': 'DJJIB',
  'Aden': 'YEADE',
  'Suez': 'EGSUZ',
  'Port Said': 'EGPSD',
  'Jebel Ali': 'AEJEA',
  'Fujairah': 'AEFJR',
  'Dubai': 'AEDXB',
  'Istanbul': 'TRIST',
  'Piraeus': 'GRPIR',
  'Naples': 'ITNAP',
  'Genoa': 'ITGOA',
  'Valencia': 'ESVLC',
  'Barcelona': 'ESBCN',
  'Marseille': 'FRMRS',
  'Le Havre': 'FRLEH',
  'Felixstowe': 'GBFEL',
  'London': 'GBLON',
  'Bremen': 'DEBRE',
  'Hamburg': 'DEHAM',
  'Antwerp': 'BEANR',
  'Amsterdam': 'NLAMS',
  'Rotterdam': 'NLRTM',
};

// Fuel type mapping from CSV to our format
const fuelTypeMapping: Record<string, string> = {
  'VLSFO': 'VLSFO',
  'MGO': 'MGO',
  'LSMGO': 'LSGO', // Map LSMGO to LSGO
  'HSFO': 'HSFO', // We'll add HSFO support
};

// Generate dummy prices for missing fuel types
function generateDummyPrice(fuelType: string, basePrice?: number): number {
  const ranges: Record<string, { min: number; max: number }> = {
    'VLSFO': { min: 450, max: 550 },
    'LSGO': { min: 650, max: 750 },
    'MGO': { min: 800, max: 900 },
    'HSFO': { min: 350, max: 450 },
  };

  if (basePrice) {
    // Add some variation to base price
    const variation = (Math.random() - 0.5) * 50;
    return Math.round((basePrice + variation) * 100) / 100;
  }

  const range = ranges[fuelType] || ranges['VLSFO'];
  return Math.round((range.min + Math.random() * (range.max - range.min)) * 100) / 100;
}

async function main() {
  console.log('🚢 Starting port data update...\n');

  // 1. Fetch ports from API
  console.log('📡 Fetching ports from API...');
  const apiResponse = await fetch('https://maritime-route-api.onrender.com/ports');
  const apiData = await apiResponse.json();
  const apiPorts = apiData.ports || {};
  console.log(`   ✅ Fetched ${Object.keys(apiPorts).length} ports from API\n`);

  // 2. Read CSV file
  console.log('📄 Reading CSV file...');
  const csvPath = '/Users/tarun/Downloads/bunker_prices_worldwide_expanded.csv';
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  const headers = lines[0].split(',');
  
  // Parse CSV data
  const csvPrices: Record<string, Record<string, number>> = {};
  const portNames = new Set<string>();
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length < 4) continue;
    
    const portName = values[1].trim();
    const fuelType = values[3].trim();
    const price = parseFloat(values[4].trim());
    
    if (isNaN(price)) continue;
    
    portNames.add(portName);
    
    if (!csvPrices[portName]) {
      csvPrices[portName] = {};
    }
    
    const mappedFuelType = fuelTypeMapping[fuelType] || fuelType;
    if (!csvPrices[portName][mappedFuelType]) {
      csvPrices[portName][mappedFuelType] = price;
    }
  }
  
  console.log(`   ✅ Found ${portNames.size} unique ports in CSV\n`);

  // 3. Build port database
  console.log('🏗️  Building port database...');
  const ports: any[] = [];
  const prices: any[] = [];
  const processedCodes = new Set<string>();

  // First, add ports from API
  for (const [code, data] of Object.entries(apiPorts)) {
    const portData = data as any;
    const portName = portData.name;
    
    // Find matching port name in CSV (improved matching)
    let matchedName = portName;
    let bestMatch = '';
    let bestScore = 0;
    
    for (const csvName of portNames) {
      const csvLower = csvName.toLowerCase();
      const portLower = portName.toLowerCase();
      
      // Exact match
      if (csvLower === portLower) {
        matchedName = csvName;
        break;
      }
      
      // Check if one contains the other
      if (portLower.includes(csvLower) || csvLower.includes(portLower)) {
        const score = Math.min(csvLower.length, portLower.length) / Math.max(csvLower.length, portLower.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = csvName;
        }
      }
      
      // Check for common variations
      const variations: Record<string, string[]> = {
        'jebel ali': ['jebel ali', 'dubai', 'jebel'],
        'port said': ['port said', 'suez'],
        'new york': ['new york', 'nyc'],
        'ho chi minh': ['ho chi minh', 'saigon'],
      };
      
      for (const [key, variants] of Object.entries(variations)) {
        if (portLower.includes(key) && variants.some(v => csvLower.includes(v))) {
          matchedName = csvName;
          break;
        }
      }
    }
    
    if (!matchedName && bestMatch) {
      matchedName = bestMatch;
    }

    const country = code.substring(0, 2);
    const fuelCapabilities: string[] = [];
    
    // Determine fuel capabilities from CSV or generate defaults
    if (csvPrices[matchedName]) {
      Object.keys(csvPrices[matchedName]).forEach(ft => {
        if (!fuelCapabilities.includes(ft)) fuelCapabilities.push(ft);
      });
    }
    
    // If no capabilities found, add defaults
    if (fuelCapabilities.length === 0) {
      fuelCapabilities.push('VLSFO', 'LSGO', 'MGO');
    }

    ports.push({
      port_code: code,
      name: portName,
      country: country,
      coordinates: {
        lat: portData.lat,
        lon: portData.lon,
      },
      fuel_capabilities: fuelCapabilities,
    });

    // Add prices from CSV or generate dummy
    const portPrices = csvPrices[matchedName] || {};
    const fuelTypes = ['VLSFO', 'LSGO', 'MGO', 'HSFO'];
    
    for (const fuelType of fuelTypes) {
      let price = portPrices[fuelType];
      
      if (!price) {
        // Generate dummy price
        price = generateDummyPrice(fuelType, portPrices['VLSFO']);
      }
      
      prices.push({
        port_code: code,
        fuel_type: fuelType,
        price_per_mt: price,
        currency: 'USD',
        last_updated: new Date().toISOString(),
      });
    }

    processedCodes.add(code);
  }

  // Add ports from CSV that aren't in API
  console.log('   Adding ports from CSV not in API...');
  let addedFromCSV = 0;
  
  for (const portName of portNames) {
    const code = portNameToCode[portName];
    if (!code || processedCodes.has(code)) continue;

    // Try to infer coordinates from region or use defaults
    const region = csvContent.split('\n').find(line => line.includes(portName))?.split(',')[2] || '';
    let lat = 0, lon = 0;
    
    // Simple region-based defaults (can be improved)
    if (region.includes('Asia')) {
      lat = 20 + Math.random() * 30;
      lon = 100 + Math.random() * 40;
    } else if (region.includes('Europe')) {
      lat = 40 + Math.random() * 20;
      lon = -10 + Math.random() * 30;
    } else if (region.includes('America')) {
      lat = 25 + Math.random() * 30;
      lon = -120 + Math.random() * 60;
    }

    const country = code.substring(0, 2);
    const portPrices = csvPrices[portName] || {};
    const fuelCapabilities = Object.keys(portPrices).length > 0 
      ? Object.keys(portPrices) 
      : ['VLSFO', 'LSGO', 'MGO'];

    ports.push({
      port_code: code,
      name: portName,
      country: country,
      coordinates: {
        lat: lat || 0,
        lon: lon || 0,
      },
      fuel_capabilities: fuelCapabilities,
    });

    // Add prices
    const fuelTypes = ['VLSFO', 'LSGO', 'MGO', 'HSFO'];
    for (const fuelType of fuelTypes) {
      let price = portPrices[fuelType];
      if (!price) {
        price = generateDummyPrice(fuelType, portPrices['VLSFO']);
      }
      
      prices.push({
        port_code: code,
        fuel_type: fuelType,
        price_per_mt: price,
        currency: 'USD',
        last_updated: new Date().toISOString(),
      });
    }

    processedCodes.add(code);
    addedFromCSV++;
  }

  console.log(`   ✅ Added ${addedFromCSV} ports from CSV\n`);

  // 4. Write updated files
  console.log('💾 Writing updated files...');
  
  const portsPath = path.join(__dirname, '../src/data/ports.json');
  const pricesPath = path.join(__dirname, '../src/data/prices.json');
  
  fs.writeFileSync(portsPath, JSON.stringify(ports, null, 2));
  fs.writeFileSync(pricesPath, JSON.stringify(prices, null, 2));
  
  console.log(`   ✅ Updated ports.json with ${ports.length} ports`);
  console.log(`   ✅ Updated prices.json with ${prices.length} price entries\n`);

  // 5. Copy to frontend
  console.log('📋 Copying to frontend...');
  const frontendPortsPath = path.join(__dirname, '../frontend/lib/data/ports.json');
  const frontendPricesPath = path.join(__dirname, '../frontend/lib/data/prices.json');
  
  fs.writeFileSync(frontendPortsPath, JSON.stringify(ports, null, 2));
  fs.writeFileSync(frontendPricesPath, JSON.stringify(prices, null, 2));
  
  console.log(`   ✅ Copied to frontend\n`);

  console.log('🎉 Port data update complete!');
  console.log(`\n📊 Summary:`);
  console.log(`   - Total ports: ${ports.length}`);
  console.log(`   - Total price entries: ${prices.length}`);
  console.log(`   - Ports from API: ${Object.keys(apiPorts).length}`);
  console.log(`   - Ports from CSV: ${addedFromCSV}`);
}

main().catch(console.error);

