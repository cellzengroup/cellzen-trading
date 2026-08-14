// Training data for the shipment-mode classifier (see shipmentMode.js).
//
// The lexicon in dangerousGoodsLexicon.js catches titles that NAME a regulated
// article. This corpus is what lets the classifier generalise past it — 1688
// titles are machine-translated marketing text, so the same product arrives
// worded a hundred ways ("charge treasure", "portable power supply", "mobile
// power source" are all a power bank), and no word list ever finishes.
//
// Labels are the shipping mode the goods must take:
//   'land' — dangerous / restricted for air freight, goes by road or sea
//   'air'  — general cargo, fine to fly
//
// Titles are written the way gtradea actually stores them: long, keyword-
// stuffed, mixed English/Chinese, inconsistent casing. Short clean names would
// train a classifier that only works on data we don't have.
//
// Editing this file changes the model — it is re-trained from scratch at
// process start (it takes single-digit milliseconds). After a change, run
//   node backend/scripts/eval-shipment-mode.js
// which holds examples out and reports whether accuracy actually improved.

// ---------------------------------------------------------------------- LAND
// Dangerous / air-restricted goods.
const LAND = [
  // --- lithium cells, named outright
  'Wholesale 18650 Lithium Battery 3.7V 2600mAh Rechargeable Cell for Flashlight',
  'Large Capacity 20000mAh Power Bank Fast Charging Portable Mobile Power Supply',
  '充电宝 20000毫安 大容量 快充 移动电源 便携式',
  'Mini Charge Treasure 10000mAh Cute Cartoon Portable Power Source for Girls',
  'CR2032 Button Cell Coin Battery Pack of 100 for Watch Calculator Remote',
  'Rechargeable AA AAA Ni-MH Battery Set with Charging Dock Household Use',
  '锂电池 组 12V 大容量 可充电 电动工具专用',
  'Lithium Polymer Battery 3.7V 500mAh Lipo Cell for DIY Electronics Project',
  'Solar Panel Power Generator Portable Outdoor Camping Energy Storage Station',
  'Car Jump Starter 12V Emergency Booster Multi-function Portable Power Supply',
  // --- devices with a cell inside, often unstated
  'Wireless Bluetooth Earbuds TWS Noise Cancelling Sports Headset Long Standby',
  '蓝牙耳机 无线 双耳 运动 降噪 长续航',
  'Smart Watch Fitness Tracker Heart Rate Blood Pressure Sleep Monitor Bracelet',
  '智能手表 运动手环 心率监测 多功能',
  'Portable Handheld Mini Fan USB Rechargeable Desktop Cooling Summer Outdoor',
  'LED Rechargeable Work Light Camping Lantern Emergency Outdoor Waterproof',
  'Electric Toothbrush Sonic Vibration Adult Waterproof with Replacement Heads',
  'Cordless Electric Screwdriver Set Household Repair Tool Kit Rechargeable',
  'Mini Drone with 4K Camera Foldable Quadcopter Beginner Remote Control Aircraft',
  '无人机 高清 航拍 折叠 四轴飞行器',
  'Remote Control Car Off-road Climbing Vehicle Boy Toy High Speed Racing',
  'Electric Massage Gun Deep Muscle Relaxation Fascia Massager Portable',
  '按摩枪 筋膜枪 深层 肌肉放松 便携',
  'Wireless Bluetooth Speaker Outdoor Waterproof Subwoofer Portable Sound Box',
  'Action Camera 4K Waterproof Sports DV Helmet Cam Underwater Diving Recorder',
  'Dash Cam Car DVR Front and Rear Dual Lens Night Vision Driving Recorder',
  'Electric Hair Clipper Cordless Trimmer Professional Barber Shaving Machine',
  '剃须刀 电动 充电式 男士 刮胡刀',
  'Handheld Vacuum Cleaner Cordless Car Home Mini Portable Strong Suction',
  'Electric Scooter Foldable Adult Two Wheel Balance Car Commuting Vehicle',
  '平衡车 电动 双轮 成人 代步',
  'Wireless Mouse and Keyboard Combo Silent Slim Office Bluetooth Set',
  'Bluetooth Selfie Stick Tripod Remote Shutter Extendable Phone Holder Stand',
  'Electric Milk Frother Handheld Coffee Foam Maker Rechargeable Kitchen Gadget',
  'Electric Lint Remover Fabric Shaver Rechargeable Clothes Fuzz Pill Trimmer',
  'Heated Vest Warm Jacket USB Charging Winter Outdoor Thermal Clothing',
  'Rechargeable Hand Warmer Double Sided Heating Pocket Winter Portable',
  'Wireless Charger 15W Fast Charging Pad Stand for Mobile Phone Desktop',
  'Bluetooth Tracker Anti-lost Tag Key Finder Locator Smart Device',
  'Electric Nail Drill Manicure Machine Polishing Grinder Rechargeable Salon',
  'LED Makeup Mirror with Light Rechargeable Vanity Desktop Touch Dimming',
  'Karaoke Microphone Wireless Bluetooth Handheld Speaker Singing Machine',
  'Electric Pet Nail Grinder Quiet Dog Cat Claw Trimmer Rechargeable',
  'Portable Blender Juicer Cup USB Rechargeable Smoothie Mixer Bottle',
  'Smart Door Lock Fingerprint Keyless Electronic Password Home Security',
  'Vape Pod Kit Disposable Electronic Cigarette 5000 Puffs Fruit Flavor',
  '电子烟 一次性 雾化器 蒸汽',
  'Laser Pointer Rechargeable Green Beam Presentation Pen Astronomy',
  'Electric Air Pump Inflator Portable Car Tire Compressor Digital Gauge',
  // --- mains-only electrical goods. No cell anywhere in the carton, so none of
  // these are dangerous goods in the regulatory sense — they ship by land
  // because warehouse policy sends ALL electrical items that way. Kept in the
  // corpus so the model learns the policy and not just the word list.
  'Touch Screen Induction Cooker Household Intelligent Multi-Function Hot Pot 220V',
  'European Standard Socket Power Strip Independent Switch Extension Cord Mains',
  'Handheld Garment Steamer Household Steam Iron Mini Ironing Machine Plug In',
  'Electric Rice Cooker Household Multi-Function Non-Stick Inner Pot 220V',
  'Smart Circuit Breaker Wifi Prepaid Meter Din Rail Household 220V Mains',
  'Electric Kettle Travel Foldable Silicone Portable Water Boiler 220V',
  'Electric Blanket Heating Pad Timer Thermostat Winter Bed Warmer 220V',
  'Digital Photo Frame 10 Inch WiFi Cloud Electronic Album Touch Screen Plug In',
  'Mini Sewing Machine Household Electric Portable Tailor Stitching 220V Adapter',
  'LED Ceiling Light Modern Living Room Lamp Remote Control Dimmable 220V',
  'Desktop Electronic Kitchen Scale Digital Display Precision 0.1g Baking',
  'Air Purifier Household HEPA Filter Formaldehyde Removal Bedroom Quiet',
  '电饭煲 家用 多功能 不粘内胆 220V',
  '插座 排插 独立开关 接线板 家用',
  // --- cycles and ride-ons, powered or not
  'Mountain Bike 26 Inch 21 Speed Adult Bicycle Shock Absorbing Off-road',
  'Kids Balance Bike Without Pedals Toddler 1-3 Years Push Along Scooter',
  'Folding Bicycle 20 Inch Ultralight Portable Adult Commuting City Bike',
  'Children Tricycle 3 Wheel Pedal Trike Baby Ride On Toy Outdoor',
  'Kick Scooter Kids Three Wheel Flashing Foldable Height Adjustable',
  '自行车 山地车 26寸 21速 成人 变速',
  '滑板车 儿童 三轮 可折叠 闪光轮',
  // --- sharps
  'Professional Kitchen Chef Knife Set Stainless Steel 8 Inch Sharp Cleaver',
  '菜刀 不锈钢 厨房 锋利 切片刀',
  'Folding Pocket Knife Outdoor Camping Survival Multi Tool Stainless Blade',
  'Utility Box Cutter Retractable Blade Heavy Duty Warehouse Carton Opener',
  'Tailor Scissors Fabric Cutting Sewing Shears Professional Stainless Steel',
  '剪刀 裁缝 布料 专业 不锈钢',
  'Replacement Razor Blades Double Edge Safety Shaving 100pcs Bulk Pack',
  'Garden Pruning Shears Bypass Secateurs Branch Cutter Sharp Blade',
  'Hunting Fixed Blade Knife with Leather Sheath Outdoor Survival Tool',
  'Meat Cleaver Chopping Bone Knife Butcher Heavy Duty Kitchen Chopper',
  'Craft Carving Knife Set Wood Chisel Sculpting Tool Sharp Blades',
  'Axe Camping Hatchet Wood Splitting Outdoor Survival Chopping Tool',
  '刀具 套装 厨房 家用 不锈钢',
  'Nail Clipper Set with Cuticle Nipper Scissors Stainless Manicure Kit',
  // --- flammable liquids
  'Womens Perfume Long Lasting Fragrance Eau de Parfum Floral Fresh 50ml',
  '香水 女士 持久 淡香 花果香 50ml',
  'Nail Polish Set 12 Colors Quick Dry Glitter Gel Manicure Varnish',
  '指甲油 套装 快干 闪粉 12色',
  'Nail Polish Remover Acetone Free Gentle Cleaning Liquid 100ml',
  'Essential Oil Set Aromatherapy Diffuser Lavender Peppermint Pure Natural',
  'Hand Sanitizer Gel 75% Alcohol Antibacterial Portable Travel Bottle',
  '酒精 消毒液 75% 免洗 便携',
  'Super Glue Instant Adhesive Strong Bond Cyanoacrylate 20g Repair',
  '胶水 强力 速干 万能 修补',
  'Acrylic Spray Paint Multi Purpose Graffiti DIY Car Furniture Color',
  'Model Paint Thinner Solvent Cleaning Liquid Airbrush Hobby',
  'Car Wash Wax Polish Liquid Coating Hydrophobic Detailing Spray',
  'Lighter Fluid Refill Butane Gas Canister Universal Windproof',
  // --- aerosols and gas
  'Hair Spray Strong Hold Styling Aerosol Long Lasting Salon 300ml',
  'Pepper Spray Self Defense Portable Keychain Personal Security',
  'Compressed Air Duster Spray Can Keyboard Electronics Cleaning',
  'Portable Camping Gas Stove Butane Canister Outdoor Cooking Burner',
  '喷雾 定型 发胶 持久 造型',
  'Mini Fire Extinguisher Car Home Emergency Dry Powder Portable',
  'Insecticide Spray Mosquito Killer Household Aerosol Bug Repellent',
  // --- pyrotechnic
  'Windproof Lighter Metal Refillable Cigarette Torch Flame Outdoor',
  '打火机 防风 金属 充气 户外',
  'Safety Matches Waterproof Camping Survival Fire Starter Box',
  'Birthday Cake Sparkler Candle Fountain Party Fireworks Decoration',
  // --- magnets
  'Neodymium Magnet Strong N52 Round Disc Rare Earth 20x5mm 50pcs',
  '磁铁 强力 钕铁硼 圆形 吸铁石',
  'Magnetic Building Blocks Kids Educational Construction Toy Set 100pcs',
  'Magnetic Whiteboard Sticker Wall Mounted Fridge Memo Board',
  'Magnetic Phone Car Mount Dashboard Strong Holder Universal Bracket',
  // --- corrosive / toxic / chemical
  'Bleach Cleaning Powder Laundry Whitening Stain Remover Household',
  'Drain Cleaner Powerful Pipe Unblocker Kitchen Sink Dredge Agent',
  '农药 杀虫剂 家用 灭蚊 喷洒',
  'Rust Remover Metal Derusting Liquid Automotive Chemical Cleaner',
  'Pool Chlorine Tablets Water Treatment Disinfectant Chemical',
  // --- declared hazardous
  'Dangerous Goods Packaging UN3481 Lithium Battery Shipping Label Sticker',
  '危险品 标识 易燃 警示 贴纸',
];

// ----------------------------------------------------------------------- AIR
// General cargo — nothing restricted, flies normally.
const AIR = [
  // --- apparel
  'Womens Summer Casual T-Shirt Loose Short Sleeve Cotton Round Neck Top',
  '女士 T恤 夏季 宽松 纯棉 短袖',
  'Mens Hoodie Sweatshirt Autumn Winter Fleece Thick Pullover Streetwear',
  'Korean Style Knitted Sweater Women Loose Long Sleeve Autumn Cardigan',
  'High Waist Jeans Women Straight Leg Wide Denim Trousers Vintage',
  '牛仔裤 女 高腰 直筒 宽松 复古',
  'Pleated Skirt Women A-line Knife Pleated High Waist School Uniform',
  'Mens Cotton Socks 10 Pairs Breathable Deodorant Business Crew Sock',
  '袜子 男 纯棉 透气 中筒 商务',
  'Womens Seamless Underwear Set Comfortable Cotton Breathable Briefs',
  'Sports Bra Shockproof Running Yoga Gym Fitness Vest Women',
  'Winter Scarf Cashmere Warm Thick Long Shawl Unisex Plaid',
  'Baseball Cap Adjustable Embroidered Cotton Sun Hat Unisex Outdoor',
  'Knitted Gloves Winter Warm Touchscreen Thick Fleece Lined Unisex',
  'Silk Pajamas Set Women Long Sleeve Loungewear Home Wear Two Piece',
  'Down Jacket Men Winter Thick Warm Hooded Puffer Coat Windproof',
  'Kids Cartoon Pajama Set Cotton Boys Girls Sleepwear Home Clothes',
  'Swimsuit Women One Piece Conservative Slimming Beach Bathing Suit',
  '连衣裙 女 夏季 碎花 收腰 长裙',
  // --- footwear
  'Running Shoes Men Breathable Mesh Lightweight Sports Sneakers Casual',
  '运动鞋 男 透气 网面 轻便 休闲',
  'Womens Sandals Summer Flat Beach Open Toe Comfortable Slippers',
  'Winter Snow Boots Women Plush Warm Anti-slip Ankle Booties',
  'Canvas Shoes Unisex Classic Low Top Lace Up Casual Sneakers',
  'Cotton Home Slippers Indoor Warm Non-slip Soft Sole Couple',
  'High Heels Women Pointed Toe Stiletto Party Wedding Dress Shoes',
  // --- bags and accessories
  'Womens Handbag PU Leather Shoulder Crossbody Tote Fashion Bag',
  '女包 单肩 斜挎 手提 时尚 PU皮',
  'Backpack School Bag Student Large Capacity Waterproof Travel Rucksack',
  'Mens Wallet Short Leather Bifold Card Holder Purse Business',
  'Travel Luggage Organizer Packing Cubes Set Storage Pouch',
  'Canvas Tote Shopping Bag Reusable Eco Friendly Large Grocery',
  'Phone Case for iPhone Silicone Shockproof Transparent Protective Cover',
  '手机壳 硅胶 防摔 透明 保护套',
  'Laptop Sleeve Bag 14 Inch Waterproof Felt Protective Notebook Case',
  'Watch Strap Replacement Silicone Band Sport Buckle Universal',
  '表带 硅胶 替换 运动 通用',
  'Sunglasses Women UV400 Polarized Retro Round Frame Fashion Eyewear',
  'Belt Men Genuine Leather Automatic Buckle Business Casual Waistband',
  // --- jewellery
  'Sterling Silver Earrings Womens Simple Design Hypoallergenic Studs',
  '耳环 925银 简约 气质 女士',
  'Pearl Necklace Womens Elegant Choker Wedding Party Jewelry Gift',
  'Stainless Steel Bracelet Men Cuban Chain Hip Hop Punk Accessory',
  'Hair Clips Set Women Korean Style Barrettes Pins Headwear',
  'Resin Ring Set Vintage Colorful Stackable Fashion Jewelry Women',
  // --- home textiles and homeware
  'Bed Sheet Set Four Piece Cotton Quilt Cover Pillowcase Bedding',
  '床上四件套 纯棉 被套 床单 枕套',
  'Bath Towel Cotton Absorbent Soft Quick Dry Large Beach Towel',
  'Blackout Curtain Bedroom Thermal Insulated Window Drape Panel',
  'Sofa Cover Stretch Elastic Slipcover Anti-slip Living Room Protector',
  'Memory Foam Pillow Neck Support Cervical Sleeping Bed Pillow',
  'Area Rug Living Room Soft Plush Anti-slip Floor Carpet Mat',
  'Storage Box Foldable Fabric Clothes Organizer Wardrobe Container',
  'Plastic Hangers 20pcs Non-slip Space Saving Wardrobe Clothes Hanger',
  'Shoe Rack Multi Layer Simple Assembly Dormitory Storage Shelf',
  'Laundry Basket Foldable Pop Up Dirty Clothes Hamper Mesh',
  // --- kitchen, non-sharp
  'Ceramic Dinner Plate Set Nordic Style Household Tableware 6pcs',
  '陶瓷 餐盘 北欧 家用 碟子',
  'Silicone Baking Mold Cake Mould Non-stick Oven Bakeware Tray',
  'Stainless Steel Water Bottle Vacuum Insulated Thermos Flask 500ml',
  'Coffee Mug Ceramic Cup with Handle Office Home Drinkware',
  'Wooden Spatula Set Non-stick Cookware Kitchen Cooking Utensils',
  'Food Storage Container Set Plastic Airtight Kitchen Organizer',
  'Silicone Oven Mitt Heat Resistant Glove Kitchen Baking Protection',
  'Chopsticks Set Household Reusable Alloy Non-slip Tableware 10 Pairs',
  // --- stationery and office
  'Notebook A5 Hardcover Journal Lined Diary Planner Student Stationery',
  '笔记本 A5 硬壳 学生 记事本',
  'Gel Pen Set 0.5mm Black Ink Smooth Writing School Office 12pcs',
  'Sticky Notes Memo Pad Colorful Self Adhesive Bookmark Tabs',
  'File Folder A4 Document Organizer Expanding Multi Layer Office',
  'Washi Tape Set Decorative Masking Sticker DIY Scrapbook Journal',
  'Pencil Case Large Capacity Canvas Zipper Student Stationery Bag',
  // --- toys, non-powered
  'Plush Teddy Bear Stuffed Animal Soft Toy Birthday Gift 40cm',
  '毛绒玩具 泰迪熊 公仔 生日礼物',
  'Wooden Jigsaw Puzzle 1000 Pieces Adult Educational Decompression Toy',
  'Building Blocks Set Kids Creative Assembly Educational Bricks 500pcs',
  'Rubiks Speed Cube 3x3 Professional Smooth Puzzle Toy',
  'Doll Clothes Accessories Set Handmade Fashion Dress Up Kids Toy',
  'Card Game Family Party Board Game Entertainment Playing Cards',
  // --- beauty, non-flammable
  'Makeup Brush Set 12pcs Soft Synthetic Foundation Eyeshadow Cosmetic',
  '化妆刷 套装 眼影刷 粉底刷 12支',
  'False Eyelashes Natural Thick Handmade Reusable 10 Pairs',
  'Hair Comb Wide Tooth Anti-static Detangling Wooden Brush',
  'Facial Sheet Mask Hydrating Moisturizing Skin Care 10 Pieces',
  'Lipstick Matte Velvet Long Lasting Waterproof Nude Color',
  'Hair Ties Elastic Scrunchies Set Women Ponytail Holder 20pcs',
  'Nail Art Stickers Decals Self Adhesive Manicure Decoration Sheet',
  // --- baby and pet
  'Baby Bib Waterproof Silicone Adjustable Feeding Apron Infant',
  'Baby Swaddle Blanket Cotton Muslin Wrap Newborn Receiving',
  'Pet Collar Adjustable Nylon Dog Cat Neck Strap with Bell',
  'Dog Bed Washable Soft Plush Round Pet Sleeping Cushion Mat',
  'Cat Scratching Post Sisal Board Kitten Claw Grinding Toy',
  // --- fitness and outdoor, non-powered
  'Yoga Mat Non-slip TPE Thick Exercise Fitness Pad 183x61cm',
  '瑜伽垫 加厚 防滑 健身 运动',
  'Resistance Band Set Latex Elastic Fitness Training Loop 5pcs',
  'Jump Rope Adjustable Speed Skipping Fitness Training Exercise',
  'Camping Tent 2 Person Waterproof Portable Outdoor Hiking Shelter',
  'Umbrella Folding Windproof Automatic Rain Sun UV Protection',
  // --- misc general cargo
  'Wall Sticker Removable Decorative Living Room Bedroom Decal Art',
  'Artificial Flower Bouquet Silk Rose Home Wedding Decoration',
  'Photo Frame Wooden Tabletop Picture Holder Home Decor 6 Inch',
  'Shower Curtain Waterproof Mildew Proof Bathroom Polyester with Hooks',
  'Car Seat Cover Universal Four Season Breathable Auto Interior',
  'Garden Plant Pot Set Plastic Drainage Succulent Flower Planter',
  'Screen Protector Tempered Glass Film Anti-scratch Phone Accessory',
  'Keychain Metal Cute Cartoon Pendant Bag Charm Accessory',
  'Sewing Kit Thread Needle Button Household Repair Set Portable',
  'Measuring Tape Soft Tailor Body Ruler 150cm Sewing Tool',
  'Button Set DIY Sewing Accessories Resin Coat Buttons 100pcs Assorted',
  'Embroidery Thread Set Cross Stitch Cotton Floss Handmade Craft Kit',
  // --- outdoor gear with no cell in it. Without these the model learns
  // "camping / outdoor / portable" from the camping LANTERN and camping GAS
  // STOVE above and starts routing tents onto trucks.
  'Camping Sleeping Bag Envelope Portable Outdoor Hiking Warm Thick',
  'Outdoor Picnic Mat Waterproof Foldable Beach Camping Blanket Large',
  'Hiking Backpack 40L Outdoor Mountaineering Travel Rucksack Waterproof',
  'Folding Camping Chair Portable Outdoor Beach Fishing Stool Lightweight',
  'Vacuum Insulated Lunch Box Stainless Portable Office Bento Container',
  // NOTE: mains-powered appliances used to sit here as general cargo, on the
  // reasoning that a wall-plug kettle has no cell and could legally fly. That
  // is no longer the rule — warehouse policy sends ALL electrical goods by
  // land, so they have moved to the LAND list above.
  // --- stainless steel that isn't a blade. Without these the model picks up
  // "stainless steel" from the knife and scissors examples and starts routing
  // thermos flasks and chain bracelets onto trucks.
  'Stainless Steel Drinking Straw Set Reusable with Cleaning Brush 8pcs',
  'Stainless Steel Serving Tray Round Metal Plate Kitchen Restaurant',
  'Stainless Steel Cutlery Set Spoon Fork Tableware Household 24pcs',
  'Stainless Steel Measuring Spoon Set Baking Kitchen Scoop 6pcs',
  'Leather Watch Band Replacement Strap Quick Release Classic 20mm',
  // --- Chinese general cargo. The land side of the corpus is heavily Chinese
  // (充电宝, 菜刀, 香水 …) and Han bigrams are sparse features, so without a
  // matching weight of Chinese AIR titles the model reads *any* Chinese title
  // as dangerous — which in this catalogue is most of the clothing.
  '衬衫 女 雪纺 宽松 长袖 上衣 春季',
  '皮鞋 男 商务 正装 系带 真皮',
  '浴巾 纯棉 吸水 柔软 加大 家用',
  '花瓶 陶瓷 北欧 简约 家居 装饰',
  '收纳盒 塑料 桌面 整理 抽屉 家用',
  '窗帘 遮光 卧室 隔热 简约 定制',
  '保温杯 不锈钢 真空 便携 学生 500ml',
  '项链 女 珍珠 优雅 婚礼 礼物',
  '雨伞 折叠 防风 自动 遮阳 便携',
  '拼图 木质 成人 1000片 减压 益智',
  '围裙 棉麻 厨房 烘焙 可调节 家用',
  '地毯 客厅 柔软 防滑 地垫 北欧',
  '帽子 女 草编 宽檐 夏季 防晒',
  '文具盒 大容量 帆布 学生 拉链',
  // --- Categories the LIVE catalogue is full of and this corpus originally had
  // none of. Trained only on clothing and accessories, the model read every
  // kitchen or hardware title as dangerous — an induction cooker, a frying pan
  // and a luggage trolley were all being routed onto trucks. Mains-powered and
  // unpowered homeware is ordinary cargo; what makes a gadget dangerous is a
  // cell, and these have none.
  'Non-Stick Frying Pan for Home Use Frying Eggs Steak Pancake Kitchen Cookware',
  'Stair Climbing Trolley Moving Cart Heavy Object Luggage Hand Truck Folding',
  'Projection Screen Dual Stand Home Anti-Light Portable Fabric 100 inch',
  'Tea Evaluation Cup Set Professional Certification Ceramic Sensory Tasting',
  'Kung Fu Tea Set Portable Travel Ceramic Teapot Outdoor Carry Bag',
  'Glass Tea Set Cover Bowl Sancai Tea Cup Transparent Heat Resistant',
  'Coffee Bean Distributor Stainless Manual Powder Leveler Barista Tool',
  'Coffee Tamper Mat Silicone Non-slip Espresso Barista Accessory',
  'Knee Patches Mugwort Cervical Lumbar Self Heating Herbal Plaster 10pcs',
  'Rice Paper Calligraphy Ink Painting Material Xuan Paper Art Supplies',
  'Watercolor Paint Set 24 Colors Washable Kids Art Supplies Non-toxic',
  'Basketball Hoop Frame Wall Mounted Shooting Rack Standard Outdoor Home',
  'Aluminum Alloy Desktop Stand Foldable Office Bracket Adjustable Holder',
  'Tempered Glass Lens Film Camera Protector Sticker Anti-scratch Accessory',
  'Cross-Border Alloy Engineering Vehicle Model 1:24 Static Display Toy Truck',
  // 灯笼裤 — "lantern pants". The rules stopped calling these dangerous, but the
  // model had only ever met "lantern" attached to a camping light.
  "Summer Lightweight Children's Lantern Pants Rayon Linen Breathable Trousers",
  'Womens Lantern Sleeve Blouse Chiffon Loose Casual Spring Top',
  'Rice Paper Ink Painting Xuan Paper Calligraphy Practice Sheets Bulk',
];

// ------------------------------------------------------------------- HOLDOUT
// NOT training data, and NOT to be tuned against. Read this before adding to it.
//
// The lexicon above was extended until it covered every LAND/AIR example, so
// cross-validating on that corpus now reports ~100% and means nothing: the word
// list has seen all of it. This set exists to answer the only question that
// matters — what happens to a title nobody wrote a rule for.
//
// Every entry deliberately AVOIDS the lexicon's wording and paraphrases the
// product the way a different machine translation would: a power bank as a
// "portable energy storage brick", a knife as a "stainless cutting tool", a
// lighter as a "metal flame maker". If you fix a miss here by adding the exact
// phrase to dangerousGoodsLexicon.js, you have deleted the test rather than
// passed it — add a fresh paraphrase to this list at the same time.
const HOLDOUT = [
  // dangerous, worded around the word list
  { text: 'Portable Energy Storage Brick 10000 Milliamp Fast Charge Travel Companion', label: 'land' },
  { text: 'Mobile Energy Source Mini Capsule 5000 Milliamp Emergency Backup Supply', label: 'land' },
  { text: 'Wireless Ear Buds Stereo Sound In-Ear Sport Running Long Standby', label: 'land' },
  { text: 'Smart Wrist Band Heart Rate Sleep Monitor Waterproof Sport Tracker', label: 'land' },
  { text: 'Remote Controlled Flying Camera Four Rotor Aircraft Beginner Toy', label: 'land' },
  { text: 'Slim Metal Windproof Flame Maker Refillable Cigarette Accessory', label: 'land' },
  { text: 'Portable Ignition Source Metal Refillable Windproof Outdoor Survival', label: 'land' },
  { text: 'Stainless Steel Cutting Tool Chef Grade Sharp Edge Kitchen Chopper', label: 'land' },
  { text: 'Sharp Edge Garden Pruner Branch Trimmer Heavy Duty Steel Handle', label: 'land' },
  { text: 'Fragrance Spray Long Lasting Floral Scent Women Gift Box 50ml', label: 'land' },
  { text: 'Nail Colour Gel Quick Dry Glitter Manicure Bottle 12 Shades', label: 'land' },
  { text: 'Disinfecting Wet Gel 75 Percent Ethyl Portable Squeeze Bottle', label: 'land' },
  { text: 'Strong Attraction Discs Craft Fridge Sticker Round 50pcs Steel', label: 'land' },
  { text: 'Handheld Fascia Massager Deep Tissue Muscle Relief USB Charge', label: 'land' },
  { text: 'Electronic Vapour Device Disposable 5000 Puffs Fruit Taste', label: 'land' },
  { text: 'Compressed Duster Can Electronics Keyboard Cleaning 500ml Jet', label: 'land' },
  { text: 'Two Wheel Self Balancing Vehicle Adult Commuting Kick Board', label: 'land' },
  { text: 'Head Mounted Camping Lamp Strong Light Long Endurance Outdoor', label: 'land' },
  // general cargo, likewise paraphrased
  { text: 'Womens Chiffon Blouse Summer Loose Long Sleeve Office Shirt', label: 'air' },
  { text: 'Mens Leather Oxford Dress Shoes Formal Business Lace Up', label: 'air' },
  { text: 'Cotton Bath Mat Absorbent Non-slip Bathroom Floor Rug', label: 'air' },
  { text: 'Ceramic Flower Vase Nordic Minimalist Home Table Decoration', label: 'air' },
  { text: 'Bamboo Cutting Board Kitchen Chopping Block Large Household', label: 'air' },
  { text: 'Wool Felt Coasters Set Round Table Mat Home Decor 6pcs', label: 'air' },
  { text: 'Linen Table Runner Rustic Wedding Party Decoration Natural', label: 'air' },
  { text: 'Silicone Ice Cube Tray with Lid Freezer Mold Household', label: 'air' },
  { text: 'Acrylic Makeup Organizer Drawer Cosmetic Storage Box Clear', label: 'air' },
  { text: 'Faux Leather Notebook Cover A5 Refillable Journal Business', label: 'air' },
  { text: 'Crochet Cotton Yarn Ball Handmade Knitting Thread 100g', label: 'air' },
  { text: 'Mens Sports Shorts Quick Dry Breathable Running Gym Training', label: 'air' },
  { text: 'Ceramic Soap Dispenser Bathroom Pump Bottle Nordic Style', label: 'air' },
  { text: 'Kids Educational Flash Cards Alphabet Learning Montessori Set', label: 'air' },
  { text: 'Rattan Storage Basket Woven Handmade Home Organizer Round', label: 'air' },
  { text: 'Womens Wide Brim Straw Hat Summer Beach Sun Protection', label: 'air' },
  { text: 'Glass Storage Jar with Bamboo Lid Kitchen Food Container', label: 'air' },
  { text: 'Cotton Canvas Apron Adjustable Kitchen Cooking Baking Unisex', label: 'air' },
  // Chinese, likewise avoiding the lexicon: 随身电源 rather than 充电宝, 香氛液
  // rather than 香水, 强磁 rather than 磁铁. Half of gtradea's titles never get
  // translated, so a holdout with no Han in it tests half the catalogue.
  { text: '随身电源 大容量 快充 便携 应急 户外', label: 'land' },
  { text: '香氛液 持久 淡香 女士 礼盒 50ml', label: 'land' },
  { text: '强磁 吸附 圆片 冰箱贴 手工 diy', label: 'land' },
  { text: '毛衣 女 针织 秋冬 加厚 套头', label: 'air' },
  { text: '书包 学生 大容量 防水 双肩 减负', label: 'air' },
  { text: '马克杯 陶瓷 办公室 带盖 家用 简约', label: 'air' },
];

module.exports = {
  LAND,
  AIR,
  HOLDOUT,
  // Flat labelled form — what the trainer and the evaluation script both read.
  EXAMPLES: [
    ...LAND.map((text) => ({ text, label: 'land' })),
    ...AIR.map((text) => ({ text, label: 'air' })),
  ],
};
