// The REGULATED-TERMS half of shipment-mode classification (see shipmentMode.js).
//
// Data only, deliberately: which words force a box onto a truck instead of a
// plane is a compliance question, not a modelling one. A statistical classifier
// trained on product titles can be wrong about "lithium battery" if the wording
// is unusual, and being wrong in that direction means undeclared dangerous goods
// on an aircraft. So anything explicitly regulated is matched here as a HARD
// RULE that the trained model can never overturn, and it lives in one flat,
// readable list a non-programmer can audit and extend.
//
// Bilingual on purpose: gtradea's product_name is the raw 1688 listing title,
// which arrives either machine-translated to English or still in Chinese (often
// both in the same string), so an English-only word list silently passes half
// the catalogue.

// ---------------------------------------------------------------- hazard terms
// Grouped by the reason they're restricted — the group label is what the 1688
// panel shows staff when it explains why a row defaulted to By Land.
const HAZARD_CLASSES = [
  {
    key: 'lithium_battery',
    label: 'Lithium battery',
    terms: [
      'battery', 'batteries', 'battery-powered', 'battery powered', 'lithium',
      'li-ion', 'li ion', 'lion battery', 'lipo', 'li-po', 'polymer battery',
      'power bank', 'powerbank', 'power-bank', 'portable charger', 'charge treasure',
      '18650', '21700', '26650', 'coin cell', 'button cell', 'cr2032', 'aa battery',
      'aaa battery', 'rechargeable', 'mah', 'accumulator',
      '电池', '锂电', '锂电池', '充电宝', '移动电源', '蓄电池', '纽扣电池', '可充电',
    ],
  },
  {
    key: 'battery_device',
    label: 'Built-in battery device',
    // Products that essentially always ship WITH a cell inside even when the
    // title never says "battery" — the single largest source of undeclared
    // lithium in a 1688 consignment.
    terms: [
      'mobile phone', 'cell phone', 'smartphone', 'smart phone', 'iphone',
      'tablet pc', 'ipad', 'laptop', 'notebook computer', 'macbook',
      'earbuds', 'earphone', 'earphones', 'headphone', 'headphones', 'headset',
      'airpods', 'tws', 'bluetooth speaker', 'wireless speaker', 'soundbar',
      'smart watch', 'smartwatch', 'fitness tracker', 'smart band', 'smart bracelet',
      'drone', 'quadcopter', 'rc car', 'rc plane', 'remote control car',
      'e-cigarette', 'e cigarette', 'electronic cigarette', 'vape', 'vaporizer', 'pod kit',
      'electric toothbrush', 'electric shaver', 'electric razor', 'hair clipper',
      'flashlight', 'torch light', 'headlamp', 'led lantern',
      // NOT a bare "balance car": on 1688 that is overwhelmingly a toddler
      // push-along bike with no pedals and no cell. The self-balancing wording
      // is what actually means a hoverboard.
      'hoverboard', 'electric scooter', 'e-bike', 'electric bike',
      'self balancing', 'self-balancing',
      'cordless drill', 'electric screwdriver', 'power tool',
      'digital camera', 'action camera', 'gopro', 'camcorder', 'dash cam',
      'wireless mouse', 'wireless keyboard', 'bluetooth', 'wireless charger',
      'massage gun', 'electric massager', 'vibrator', 'handheld fan', 'usb fan',
      'ups', 'inverter', 'solar panel', 'car jump starter',
      // "cordless" is the single most reliable one-word tell that a cell is in
      // the box: the cord is gone because a battery replaced it.
      'cordless', 'robot vacuum', 'handheld vacuum',
      'heated vest', 'heated jacket', 'heated gloves', 'heated insole', 'hand warmer',
      'smart door lock', 'fingerprint lock', 'smart lock',
      '手机', '平板电脑', '笔记本电脑', '耳机', '蓝牙', '音箱', '智能手表', '手环',
      '无人机', '电子烟', '电动牙刷', '剃须刀', '手电筒', '电动车', '平衡车',
      '相机', '摄像头', '电钻', '按摩枪', '电动',
    ],
  },
  {
    key: 'electronics',
    label: 'Electronic goods',
    // Warehouse policy, wider than the dangerous-goods regulations: EVERY
    // electrical or electronic item goes by land, whether or not it has a cell
    // in it. A mains-only rice cooker carries no lithium and would legally fly —
    // it still goes on a truck here. Kept as its own class so the reason shown
    // to staff says "Electronic goods" and not "Lithium battery", which would be
    // a false claim on a customs-facing screen.
    terms: [
      'electric', 'electrical', 'electronic', 'electronics', 'motorized', 'motorised',
      'powered', 'plug in', 'plug-in', '220v', '110v', 'usb',
      'appliance', 'cooker', 'induction cooker', 'rice cooker', 'kettle', 'toaster',
      'microwave', 'air fryer', 'deep fryer', 'blender', 'juicer', 'food processor',
      'coffee machine', 'espresso machine', 'milk frother', 'water dispenser',
      // Narrow forms on purpose: a bare 'iron' matches cast-iron pans and
      // wrought-iron decor, a bare 'vacuum' matches vacuum-insulated flasks,
      // and a bare 'steamer' matches bamboo food steamers — all of which are
      // ordinary cargo.
      'steam iron', 'electric iron', 'clothes iron', 'flat iron', 'hair straightener',
      'garment steamer', 'electric steamer', 'vacuum cleaner', 'humidifier', 'dehumidifier',
      'air purifier', 'heater', 'radiator', 'air conditioner', 'refrigerator',
      'washing machine', 'dishwasher', 'sewing machine', 'ironing machine',
      'lamp', 'led', 'light bulb', 'night light', 'desk light', 'string lights',
      'projector', 'touch screen', 'lcd', 'oled', 'display screen', 'monitor',
      'television', 'set top box', 'printer', 'scanner', 'router', 'modem',
      'charger', 'adapter', 'power supply', 'power strip', 'extension cord',
      'socket', 'circuit breaker', 'transformer', 'voltage', 'thermostat',
      'electronic scale', 'digital scale', 'digital display', 'digital meter',
      'motor', 'generator', 'servo', 'solenoid', 'circuit board', 'pcb',
      'sensor', 'smart home', 'wifi', 'remote control', 'game console', 'gamepad',
      // NOT a bare 'turntable': on 1688 that is nearly always a lazy-susan
      // storage tray, not a record deck.
      'amplifier', 'microphone', 'record player', 'dj turntable', 'projector screen',
      '电器', '电子', '电动', '电源', '插座', '充电器', '灯', 'led灯', '数显',
      '电饭煲', '电水壶', '电熨斗', '吸尘器', '加湿器', '投影', '显示屏', '遥控',
    ],
  },
  {
    key: 'cycle',
    label: 'Cycle / ride-on',
    // Also warehouse policy rather than regulation: bicycles and everything in
    // that family ship by land regardless of whether they are powered.
    terms: [
      'bicycle', 'bicycles', 'bike', 'bikes', 'cycle', 'cycles',
      'tricycle', 'tricycles', 'unicycle', 'motorcycle', 'motorbike',
      'scooter', 'scooters', 'balance bike', 'kick scooter', 'ride on car',
      'ride-on', 'pedal car', 'go kart',
      '自行车', '单车', '童车', '三轮车', '滑板车', '平衡车',
    ],
  },
  {
    key: 'sharp',
    label: 'Sharp / bladed article',
    terms: [
      'knife', 'knives', 'blade', 'blades', 'razor blade', 'box cutter', 'utility knife',
      'scissors', 'shears', 'cleaver', 'machete', 'dagger', 'sword', 'katana',
      'axe', 'hatchet', 'chisel', 'scalpel', 'switchblade', 'multitool', 'multi-tool',
      'ice pick', 'awl', 'arrow head', 'broadhead', 'throwing star',
      '刀', '刀具', '刀片', '剪刀', '菜刀', '匕首', '斧头', '剑', '锯',
    ],
  },
  {
    key: 'flammable_liquid',
    label: 'Flammable liquid',
    terms: [
      'perfume', 'cologne', 'eau de toilette', 'fragrance oil', 'essential oil',
      'nail polish', 'nail varnish', 'polish remover', 'acetone',
      'alcohol', 'ethanol', 'isopropyl', 'hand sanitizer', 'sanitiser',
      'paint', 'lacquer', 'varnish', 'thinner', 'solvent', 'turpentine',
      'super glue', 'adhesive glue', 'contact cement', 'kerosene', 'gasoline',
      'petrol', 'diesel', 'lighter fluid', 'fuel',
      'car wax', 'car polish', 'wax polish', 'detailing spray', 'tire shine',
      '香水', '指甲油', '洗甲水', '酒精', '油漆', '稀释剂', '溶剂', '胶水', '燃油', '汽油',
    ],
  },
  {
    key: 'aerosol_gas',
    label: 'Aerosol / compressed gas',
    terms: [
      'aerosol', 'spray can', 'spray paint', 'hairspray', 'hair spray',
      'pepper spray', 'air freshener spray', 'deodorant spray', 'insecticide spray',
      'butane', 'propane', 'lpg', 'compressed gas', 'gas cylinder', 'gas canister',
      'co2 cartridge', 'fire extinguisher', 'oxygen tank',
      // "inflator" on its own caught a basketball hoop that shipped with a hand
      // pump. Only the powered/pressurised kinds are restricted.
      'tire inflator', 'electric inflator', 'air compressor', 'tire compressor',
      'electric air pump', 'electric pump',
      '气雾', '喷雾', '喷罐', '丁烷', '压缩气', '气瓶', '灭火器', '打火机',
    ],
  },
  {
    key: 'pyrotechnic',
    label: 'Pyrotechnic / igniter',
    terms: [
      'lighter', 'lighters', 'matches', 'matchbox', 'firework', 'fireworks',
      'firecracker', 'sparkler', 'flare', 'gunpowder', 'primer cap', 'party popper',
      '烟花', '爆竹', '火柴', '火药',
    ],
  },
  {
    key: 'magnet',
    label: 'Strong magnet',
    terms: [
      'magnet', 'magnets', 'magnetic', 'neodymium', 'ndfeb', 'ferrite magnet',
      '磁铁', '磁性', '磁力', '钕磁',
    ],
  },
  {
    key: 'corrosive_toxic',
    label: 'Corrosive / toxic',
    terms: [
      'bleach', 'caustic soda', 'sulfuric', 'hydrochloric', 'battery acid',
      'pesticide', 'insecticide', 'herbicide', 'rat poison', 'mercury',
      'corrosive', 'toxic', 'drain cleaner', 'descaler',
      'rust remover', 'derusting', 'chemical cleaner', 'chlorine', 'ammonia',
      '漂白', '农药', '杀虫剂', '腐蚀', '有毒', '化学品', '硫酸',
    ],
  },
  {
    key: 'declared_flammable',
    label: 'Declared flammable / hazardous',
    terms: [
      'flammable', 'inflammable', 'combustible', 'explosive', 'hazardous',
      'dangerous goods', 'hazmat', 'un3480', 'un3481', 'msds',
      '易燃', '易爆', '危险品', '危险货物',
    ],
  },
];

// ------------------------------------------------------------------ suppressors
// Phrases that CONTAIN a hazard term but are not the hazardous article. A
// suppressor cancels a hazard hit only when it fully covers that hit's span
// (see applySuppressors in shipmentMode.js), so "phone case and power bank"
// still classifies as dangerous on the power bank while dropping the "phone".
//
// These are the false positives that actually turned up in 1688 titles: a
// pleated skirt is 刀褶裙 — literally "knife pleat" — and machine translation
// renders it "knife pleated skirt", which would otherwise put a skirt on a truck.
const SUPPRESSORS = [
  // sharps that aren't sharps
  'knife pleat', 'knife pleated', 'knife-pleated', 'knife edge collar',
  'butter knife', 'plastic knife', 'toy knife', 'knife holder', 'knife block',
  'knife sharpener stand', 'scissors charm', 'scissor-shaped',
  '刀褶', '刀叉勺',
  // batteries that aren't batteries
  'battery free', 'battery-free', 'no battery', 'without battery',
  'battery not included', 'excluding battery', 'battery case only',
  'battery cover', 'battery compartment', 'battery holder', 'battery box empty',
  '不含电池', '无电池', '不带电池',
  // devices whose ACCESSORY is being sold, not the device
  'phone case', 'phone cases', 'mobile phone case', 'cell phone case',
  'phone holder', 'phone stand', 'phone mount', 'phone strap', 'phone bag',
  'phone screen protector', 'phone film', 'laptop sleeve', 'laptop bag',
  'laptop stand', 'laptop skin', 'tablet case', 'earphone case', 'earbuds case',
  'headphone stand', 'smart watch strap', 'watch band for', 'camera bag',
  'camera strap', 'drone bag',
  // "…for iPhone / for Samsung" is compatibility wording on an ACCESSORY. The
  // suppressor only covers the device name it contains, so "Power Bank for
  // iPhone" still keeps its power-bank hit and still ships by land.
  'for iphone', 'for samsung', 'for huawei', 'for xiaomi', 'for android phone',
  'for mobile phone', 'for cell phone', 'compatible with iphone',
  // Phone/tablet accessories seen in the live catalogue that were being routed
  // onto trucks: a lens film, an aluminium stand, an IR blaster, and a mains
  // circuit breaker whose only sin was "controlled by mobile phone".
  'phone stand', 'tablet stand', 'laptop holder', 'phone bracket', 'phone tripod',
  'lens film', 'lens protector', 'screen protector', 'tempered film',
  'protector film', 'protective film', 'camera lens film', 'polarized light film',
  'phone app', 'mobile phone app', 'mobile phone control', 'mobile phone remote',
  'infrared transmitter', 'ir transmitter', 'phone infrared', 'phone camera',
  'protective sticker', 'phone sticker',
  '手机壳', '手机套', '手机支架', '手机膜', '耳机壳', '电脑包', '相机包', '表带',
  // "electric" as a colour/style word rather than a powered device
  'electric blue', 'electric pink',
  // magnetic as a closure on soft goods — still checked by staff, but a
  // magnetic-clasp handbag is not a magnet shipment
  // Only where the magnet is a trinket. NOT 'magnetic stand' / 'magnetic
  // holder' / 'magnetic phone' — those were tried and had to come out: a
  // magnetic car mount really does hold a neodymium magnet, and suppressing the
  // word to spare an aluminium laptop stand let the mount through as air
  // freight. If a title says magnetic, it goes by land.
  'magnetic eyelash', 'magnetic lashes', 'magnetic bookmark', 'magnetic clasp',
  // a desktop stand that happens to also fit a laptop is not a laptop
  'for laptop', 'for tablet', 'for notebook', 'laptop bracket', 'tablet holder',
  'tablet bracket', 'alloy stand', 'desktop stand', 'folding stand',
  // Garment shapes named after the hazardous thing they resemble — the same
  // trap as 刀褶裙 above. 灯笼裤 is "lantern pants", i.e. harem trousers, and it
  // was matching the LED-lantern entry.
  'lantern pants', 'lantern sleeve', 'lantern skirt', 'lantern trousers',
  '灯笼裤', '灯笼袖',
  // Non-electronic things that borrow an electronics word. These matter more
  // now that the whole 'electronics' class ships by land: a socket WRENCH and a
  // vacuum FLASK are hand tools and drinkware.
  'socket wrench', 'socket set', 'socket spanner',
  'vacuum insulated', 'vacuum flask', 'vacuum bag', 'vacuum sealed', 'vacuum storage',
  'transformers toy', 'transformer robot', 'iron on', 'iron-on', 'cast iron',
  'wrought iron', 'iron wire', 'iron frame', 'iron stand', 'iron sheet',
  // Cycling APPAREL is clothing, not a cycle.
  'cycling shorts', 'cycling jersey', 'cycling glove', 'cycling cap',
  'bike shorts', 'bike helmet', 'bicycle cover', 'bike cover', 'bike lock',
  'bike bag', 'bicycle bag', 'handlebar bag', 'bike bottle', 'bicycle bell',
  'motorcycle cycling', 'motorcycle glasses', 'motorcycle goggles',
  'motorcycle helmet', 'motorcycle gloves', 'motorcycle jacket', 'for motorcycle',
  // a stand that merely SUPPORTS a laptop is a lump of aluminium
  'laptop support', 'support stand',
  // misc
  'spray bottle empty', 'empty spray bottle', 'perfume bottle empty',
  'empty perfume bottle', 'perfume atomizer empty', 'lighter shaped',
  'alcohol free', 'alcohol-free', 'non-alcoholic', 'paint by numbers',
  // Safety claims are the opposite of a hazard declaration — "Non-toxic" was
  // matching the 'toxic' term and putting children's paints on a truck.
  'non-toxic', 'non toxic', 'nontoxic', 'non-corrosive', 'non-flammable',
  'not flammable', 'flame retardant', 'fire retardant', 'fireproof', 'fire proof',
  // Water-based children's paint isn't a flammable liquid. Kept as specific
  // phrases rather than a blanket "paint set", which — with overlap
  // suppression — would also cancel "spray paint set".
  'watercolor paint', 'watercolour paint', 'water color paint',
  'washable paint', 'finger paint', 'face paint', 'poster paint',
  'paint brush', 'paintbrush', 'body paint sticker', 'nail polish holder',
  'nail polish rack', 'nail polish display',
  '空瓶', '免酒精',
];

// -------------------------------------------------------------- air categories
// The mirror image of HAZARD_CLASSES: product families the warehouse has
// decided always DEFAULT to air, whatever the statistical model makes of the
// wording. Seating furniture is the first of them — chairs and sofas are bulky
// but perfectly ordinary cargo, and the model kept guessing otherwise from the
// company they keep in a 1688 title ("ergonomic", "reclining", "lifting",
// "swivel"), so 办公椅 and a gaming chair were arriving pre-set to By Land and
// staff were correcting the same rows after every sync.
//
// This list CANNOT put dangerous goods on an aircraft. It is consulted only
// after the hazard rules above have found nothing (see classifyShipmentMode),
// so an electric massage chair or a sofa with a built-in battery still matches
// 'electric' / 'battery' first and still ships by land. That ordering is what
// makes over-inclusion here cheap: the worst a wrong entry can do is ignore the
// model's guess on a title that was already going to fly.
//
// NOT a bare 'seat': car seat, toilet seat and seat cover are all something
// else. The words below name the article itself.
const AIR_CATEGORIES = [
  {
    key: 'seating',
    label: 'Seating furniture',
    terms: [
      'chair', 'chairs', 'armchair', 'armchairs', 'arm chair', 'highchair',
      'recliner', 'recliners', 'rocking chair', 'deck chair', 'folding chair',
      'sofa', 'sofas', 'sofa bed', 'couch', 'couches', 'settee', 'loveseat',
      'love seat', 'futon', 'ottoman', 'bean bag', 'beanbag',
      'stool', 'stools', 'bar stool', 'barstool', 'footstool',
      // 椅 and 凳 carry the meaning in every compound gtradea sends — 办公椅,
      // 电脑椅, 餐椅, 转椅, 躺椅, 摇椅, 板凳, 圆凳 — so the single characters
      // cover the family without listing it out. Han terms need no word boundary.
      '椅', '凳', '沙发',
    ],
  },
];

module.exports = { HAZARD_CLASSES, SUPPRESSORS, AIR_CATEGORIES };
