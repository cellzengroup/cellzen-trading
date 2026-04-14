/**
 * List of countries for use in dropdown menus
 * Each country has a name, ISO code, and country code
 * Supports both English and Chinese translations
 */

// Country data with both English and Chinese names
const countryData = [
  { name: "Afghanistan", nameZh: "阿富汗", code: "AF", countryCode: "+93" },
  { name: "Albania", nameZh: "阿尔巴尼亚", code: "AL", countryCode: "+355" },
  { name: "Algeria", nameZh: "阿尔及利亚", code: "DZ", countryCode: "+213" },
  { name: "Andorra", nameZh: "安道尔", code: "AD", countryCode: "+376" },
  { name: "Angola", nameZh: "安哥拉", code: "AO", countryCode: "+244" },
  { name: "Antigua and Barbuda", nameZh: "安提瓜和巴布达", code: "AG", countryCode: "+1" },
  { name: "Argentina", nameZh: "阿根廷", code: "AR", countryCode: "+54" },
  { name: "Armenia", nameZh: "亚美尼亚", code: "AM", countryCode: "+374" },
  { name: "Australia", nameZh: "澳大利亚", code: "AU", countryCode: "+61" },
  { name: "Austria", nameZh: "奥地利", code: "AT", countryCode: "+43" },
  { name: "Azerbaijan", nameZh: "阿塞拜疆", code: "AZ", countryCode: "+994" },
  { name: "Bahamas", nameZh: "巴哈马", code: "BS", countryCode: "+1" },
  { name: "Bahrain", nameZh: "巴林", code: "BH", countryCode: "+973" },
  { name: "Bangladesh", nameZh: "孟加拉国", code: "BD", countryCode: "+880" },
  { name: "Barbados", nameZh: "巴巴多斯", code: "BB", countryCode: "+1" },
  { name: "Belarus", nameZh: "白俄罗斯", code: "BY", countryCode: "+375" },
  { name: "Belgium", nameZh: "比利时", code: "BE", countryCode: "+32" },
  { name: "Belize", nameZh: "伯利兹", code: "BZ", countryCode: "+501" },
  { name: "Benin", nameZh: "贝宁", code: "BJ", countryCode: "+229" },
  { name: "Bhutan", nameZh: "不丹", code: "BT", countryCode: "+975" },
  { name: "Bolivia", nameZh: "玻利维亚", code: "BO", countryCode: "+591" },
  { name: "Bosnia and Herzegovina", nameZh: "波斯尼亚和黑塞哥维那", code: "BA", countryCode: "+387" },
  { name: "Botswana", nameZh: "博茨瓦纳", code: "BW", countryCode: "+267" },
  { name: "Brazil", nameZh: "巴西", code: "BR", countryCode: "+55" },
  { name: "Brunei", nameZh: "文莱", code: "BN", countryCode: "+673" },
  { name: "Bulgaria", nameZh: "保加利亚", code: "BG", countryCode: "+359" },
  { name: "Burkina Faso", nameZh: "布基纳法索", code: "BF", countryCode: "+226" },
  { name: "Burundi", nameZh: "布隆迪", code: "BI", countryCode: "+257" },
  { name: "Cabo Verde", nameZh: "佛得角", code: "CV", countryCode: "+238" },
  { name: "Cambodia", nameZh: "柬埔寨", code: "KH", countryCode: "+855" },
  { name: "Cameroon", nameZh: "喀麦隆", code: "CM", countryCode: "+237" },
  { name: "Canada", nameZh: "加拿大", code: "CA", countryCode: "+1" },
  { name: "Central African Republic", nameZh: "中非共和国", code: "CF", countryCode: "+236" },
  { name: "Chad", nameZh: "乍得", code: "TD", countryCode: "+235" },
  { name: "Chile", nameZh: "智利", code: "CL", countryCode: "+56" },
  { name: "China", nameZh: "中国", code: "CN", countryCode: "+86" },
  { name: "Colombia", nameZh: "哥伦比亚", code: "CO", countryCode: "+57" },
  { name: "Comoros", nameZh: "科摩罗", code: "KM", countryCode: "+269" },
  { name: "Congo", nameZh: "刚果", code: "CG", countryCode: "+242" },
  { name: "Costa Rica", nameZh: "哥斯达黎加", code: "CR", countryCode: "+506" },
  { name: "Croatia", nameZh: "克罗地亚", code: "HR", countryCode: "+385" },
  { name: "Cuba", nameZh: "古巴", code: "CU", countryCode: "+53" },
  { name: "Cyprus", nameZh: "塞浦路斯", code: "CY", countryCode: "+357" },
  { name: "Czech Republic", nameZh: "捷克共和国", code: "CZ", countryCode: "+420" },
  { name: "Denmark", nameZh: "丹麦", code: "DK", countryCode: "+45" },
  { name: "Djibouti", nameZh: "吉布提", code: "DJ", countryCode: "+253" },
  { name: "Dominica", nameZh: "多米尼克", code: "DM", countryCode: "+1" },
  { name: "Dominican Republic", nameZh: "多米尼加共和国", code: "DO", countryCode: "+1" },
  { name: "Ecuador", nameZh: "厄瓜多尔", code: "EC", countryCode: "+593" },
  { name: "Egypt", nameZh: "埃及", code: "EG", countryCode: "+20" },
  { name: "El Salvador", nameZh: "萨尔瓦多", code: "SV", countryCode: "+503" },
  { name: "Equatorial Guinea", nameZh: "赤道几内亚", code: "GQ", countryCode: "+240" },
  { name: "Eritrea", nameZh: "厄立特里亚", code: "ER", countryCode: "+291" },
  { name: "Estonia", nameZh: "爱沙尼亚", code: "EE", countryCode: "+372" },
  { name: "Eswatini", nameZh: "斯威士兰", code: "SZ", countryCode: "+268" },
  { name: "Ethiopia", nameZh: "埃塞俄比亚", code: "ET", countryCode: "+251" },
  { name: "Fiji", nameZh: "斐济", code: "FJ", countryCode: "+679" },
  { name: "Finland", nameZh: "芬兰", code: "FI", countryCode: "+358" },
  { name: "France", nameZh: "法国", code: "FR", countryCode: "+33" },
  { name: "Gabon", nameZh: "加蓬", code: "GA", countryCode: "+241" },
  { name: "Gambia", nameZh: "冈比亚", code: "GM", countryCode: "+220" },
  { name: "Georgia", nameZh: "格鲁吉亚", code: "GE", countryCode: "+995" },
  { name: "Germany", nameZh: "德国", code: "DE", countryCode: "+49" },
  { name: "Ghana", nameZh: "加纳", code: "GH", countryCode: "+233" },
  { name: "Greece", nameZh: "希腊", code: "GR", countryCode: "+30" },
  { name: "Grenada", nameZh: "格林纳达", code: "GD", countryCode: "+1" },
  { name: "Guatemala", nameZh: "危地马拉", code: "GT", countryCode: "+502" },
  { name: "Guinea", nameZh: "几内亚", code: "GN", countryCode: "+224" },
  { name: "Guinea-Bissau", nameZh: "几内亚比绍", code: "GW", countryCode: "+245" },
  { name: "Guyana", nameZh: "圭亚那", code: "GY", countryCode: "+592" },
  { name: "Haiti", nameZh: "海地", code: "HT", countryCode: "+509" },
  { name: "Honduras", nameZh: "洪都拉斯", code: "HN", countryCode: "+504" },
  { name: "Hong Kong", nameZh: "香港", code: "HK", countryCode: "+852" },
  { name: "Hungary", nameZh: "匈牙利", code: "HU", countryCode: "+36" },
  { name: "Iceland", nameZh: "冰岛", code: "IS", countryCode: "+354" },
  { name: "India", nameZh: "印度", code: "IN", countryCode: "+91" },
  { name: "Indonesia", nameZh: "印度尼西亚", code: "ID", countryCode: "+62" },
  { name: "Iran", nameZh: "伊朗", code: "IR", countryCode: "+98" },
  { name: "Iraq", nameZh: "伊拉克", code: "IQ", countryCode: "+964" },
  { name: "Ireland", nameZh: "爱尔兰", code: "IE", countryCode: "+353" },
  { name: "Italy", nameZh: "意大利", code: "IT", countryCode: "+39" },
  { name: "Jamaica", nameZh: "牙买加", code: "JM", countryCode: "+1" },
  { name: "Japan", nameZh: "日本", code: "JP", countryCode: "+81" },
  { name: "Jordan", nameZh: "约旦", code: "JO", countryCode: "+962" },
  { name: "Kazakhstan", nameZh: "哈萨克斯坦", code: "KZ", countryCode: "+7" },
  { name: "Kenya", nameZh: "肯尼亚", code: "KE", countryCode: "+254" },
  { name: "Kiribati", nameZh: "基里巴斯", code: "KI", countryCode: "+686" },
  { name: "Korea, North", nameZh: "朝鲜", code: "KP", countryCode: "+850" },
  { name: "Korea, South", nameZh: "韩国", code: "KR", countryCode: "+82" },
  { name: "Kosovo", nameZh: "科索沃", code: "XK", countryCode: "+383" },
  { name: "Kuwait", nameZh: "科威特", code: "KW", countryCode: "+965" },
  { name: "Kyrgyzstan", nameZh: "吉尔吉斯斯坦", code: "KG", countryCode: "+996" },
  { name: "Laos", nameZh: "老挝", code: "LA", countryCode: "+856" },
  { name: "Latvia", nameZh: "拉脱维亚", code: "LV", countryCode: "+371" },
  { name: "Lebanon", nameZh: "黎巴嫩", code: "LB", countryCode: "+961" },
  { name: "Lesotho", nameZh: "莱索托", code: "LS", countryCode: "+266" },
  { name: "Liberia", nameZh: "利比里亚", code: "LR", countryCode: "+231" },
  { name: "Libya", nameZh: "利比亚", code: "LY", countryCode: "+218" },
  { name: "Liechtenstein", nameZh: "列支敦士登", code: "LI", countryCode: "+423" },
  { name: "Lithuania", nameZh: "立陶宛", code: "LT", countryCode: "+370" },
  { name: "Luxembourg", nameZh: "卢森堡", code: "LU", countryCode: "+352" },
  { name: "Madagascar", nameZh: "马达加斯加", code: "MG", countryCode: "+261" },
  { name: "Malawi", nameZh: "马拉维", code: "MW", countryCode: "+265" },
  { name: "Malaysia", nameZh: "马来西亚", code: "MY", countryCode: "+60" },
  { name: "Maldives", nameZh: "马尔代夫", code: "MV", countryCode: "+960" },
  { name: "Mali", nameZh: "马里", code: "ML", countryCode: "+223" },
  { name: "Malta", nameZh: "马耳他", code: "MT", countryCode: "+356" },
  { name: "Marshall Islands", nameZh: "马绍尔群岛", code: "MH", countryCode: "+692" },
  { name: "Mauritania", nameZh: "毛里塔尼亚", code: "MR", countryCode: "+222" },
  { name: "Mauritius", nameZh: "毛里求斯", code: "MU", countryCode: "+230" },
  { name: "Mexico", nameZh: "墨西哥", code: "MX", countryCode: "+52" },
  { name: "Micronesia", nameZh: "密克罗尼西亚", code: "FM", countryCode: "+691" },
  { name: "Moldova", nameZh: "摩尔多瓦", code: "MD", countryCode: "+373" },
  { name: "Monaco", nameZh: "摩纳哥", code: "MC", countryCode: "+377" },
  { name: "Mongolia", nameZh: "蒙古", code: "MN", countryCode: "+976" },
  { name: "Montenegro", nameZh: "黑山", code: "ME", countryCode: "+382" },
  { name: "Morocco", nameZh: "摩洛哥", code: "MA", countryCode: "+212" },
  { name: "Mozambique", nameZh: "莫桑比克", code: "MZ", countryCode: "+258" },
  { name: "Myanmar", nameZh: "缅甸", code: "MM", countryCode: "+95" },
  { name: "Namibia", nameZh: "纳米比亚", code: "NA", countryCode: "+264" },
  { name: "Nauru", nameZh: "瑙鲁", code: "NR", countryCode: "+674" },
  { name: "Nepal", nameZh: "尼泊尔", code: "NP", countryCode: "+977" },
  { name: "Netherlands", nameZh: "荷兰", code: "NL", countryCode: "+31" },
  { name: "New Zealand", nameZh: "新西兰", code: "NZ", countryCode: "+64" },
  { name: "Nicaragua", nameZh: "尼加拉瓜", code: "NI", countryCode: "+505" },
  { name: "Niger", nameZh: "尼日尔", code: "NE", countryCode: "+227" },
  { name: "Nigeria", nameZh: "尼日利亚", code: "NG", countryCode: "+234" },
  { name: "North Macedonia", nameZh: "北马其顿", code: "MK", countryCode: "+389" },
  { name: "Norway", nameZh: "挪威", code: "NO", countryCode: "+47" },
  { name: "Oman", nameZh: "阿曼", code: "OM", countryCode: "+968" },
  { name: "Pakistan", nameZh: "巴基斯坦", code: "PK", countryCode: "+92" },
  { name: "Palau", nameZh: "帕劳", code: "PW", countryCode: "+680" },
  { name: "Palestine", nameZh: "巴勒斯坦", code: "PS", countryCode: "+970" },
  { name: "Panama", nameZh: "巴拿马", code: "PA", countryCode: "+507" },
  { name: "Papua New Guinea", nameZh: "巴布亚新几内亚", code: "PG", countryCode: "+675" },
  { name: "Paraguay", nameZh: "巴拉圭", code: "PY", countryCode: "+595" },
  { name: "Peru", nameZh: "秘鲁", code: "PE", countryCode: "+51" },
  { name: "Philippines", nameZh: "菲律宾", code: "PH", countryCode: "+63" },
  { name: "Poland", nameZh: "波兰", code: "PL", countryCode: "+48" },
  { name: "Portugal", nameZh: "葡萄牙", code: "PT", countryCode: "+351" },
  { name: "Qatar", nameZh: "卡塔尔", code: "QA", countryCode: "+974" },
  { name: "Romania", nameZh: "罗马尼亚", code: "RO", countryCode: "+40" },
  { name: "Russia", nameZh: "俄罗斯", code: "RU", countryCode: "+7" },
  { name: "Rwanda", nameZh: "卢旺达", code: "RW", countryCode: "+250" },
  { name: "Saint Kitts and Nevis", nameZh: "圣基茨和尼维斯", code: "KN", countryCode: "+1" },
  { name: "Saint Lucia", nameZh: "圣卢西亚", code: "LC", countryCode: "+1" },
  { name: "Saint Vincent and the Grenadines", nameZh: "圣文森特和格林纳丁斯", code: "VC", countryCode: "+1" },
  { name: "Samoa", nameZh: "萨摩亚", code: "WS", countryCode: "+685" },
  { name: "San Marino", nameZh: "圣马力诺", code: "SM", countryCode: "+378" },
  { name: "Sao Tome and Principe", nameZh: "圣多美和普林西比", code: "ST", countryCode: "+239" },
  { name: "Saudi Arabia", nameZh: "沙特阿拉伯", code: "SA", countryCode: "+966" },
  { name: "Senegal", nameZh: "塞内加尔", code: "SN", countryCode: "+221" },
  { name: "Serbia", nameZh: "塞尔维亚", code: "RS", countryCode: "+381" },
  { name: "Seychelles", nameZh: "塞舌尔", code: "SC", countryCode: "+248" },
  { name: "Sierra Leone", nameZh: "塞拉利昂", code: "SL", countryCode: "+232" },
  { name: "Singapore", nameZh: "新加坡", code: "SG", countryCode: "+65" },
  { name: "Slovakia", nameZh: "斯洛伐克", code: "SK", countryCode: "+421" },
  { name: "Slovenia", nameZh: "斯洛文尼亚", code: "SI", countryCode: "+386" },
  { name: "Solomon Islands", nameZh: "所罗门群岛", code: "SB", countryCode: "+677" },
  { name: "Somalia", nameZh: "索马里", code: "SO", countryCode: "+252" },
  { name: "South Africa", nameZh: "南非", code: "ZA", countryCode: "+27" },
  { name: "South Sudan", nameZh: "南苏丹", code: "SS", countryCode: "+211" },
  { name: "Spain", nameZh: "西班牙", code: "ES", countryCode: "+34" },
  { name: "Sri Lanka", nameZh: "斯里兰卡", code: "LK", countryCode: "+94" },
  { name: "Sudan", nameZh: "苏丹", code: "SD", countryCode: "+249" },
  { name: "Suriname", nameZh: "苏里南", code: "SR", countryCode: "+597" },
  { name: "Sweden", nameZh: "瑞典", code: "SE", countryCode: "+46" },
  { name: "Switzerland", nameZh: "瑞士", code: "CH", countryCode: "+41" },
  { name: "Syria", nameZh: "叙利亚", code: "SY", countryCode: "+963" },
  { name: "Taiwan", nameZh: "台湾", code: "TW", countryCode: "+886" },
  { name: "Tajikistan", nameZh: "塔吉克斯坦", code: "TJ", countryCode: "+992" },
  { name: "Tanzania", nameZh: "坦桑尼亚", code: "TZ", countryCode: "+255" },
  { name: "Thailand", nameZh: "泰国", code: "TH", countryCode: "+66" },
  { name: "Timor-Leste", nameZh: "东帝汶", code: "TL", countryCode: "+670" },
  { name: "Togo", nameZh: "多哥", code: "TG", countryCode: "+228" },
  { name: "Tonga", nameZh: "汤加", code: "TO", countryCode: "+676" },
  { name: "Trinidad and Tobago", nameZh: "特立尼达和多巴哥", code: "TT", countryCode: "+1" },
  { name: "Tunisia", nameZh: "突尼斯", code: "TN", countryCode: "+216" },
  { name: "Turkey", nameZh: "土耳其", code: "TR", countryCode: "+90" },
  { name: "Turkmenistan", nameZh: "土库曼斯坦", code: "TM", countryCode: "+993" },
  { name: "Tuvalu", nameZh: "图瓦卢", code: "TV", countryCode: "+688" },
  { name: "Uganda", nameZh: "乌干达", code: "UG", countryCode: "+256" },
  { name: "Ukraine", nameZh: "乌克兰", code: "UA", countryCode: "+380" },
  { name: "United Arab Emirates", nameZh: "阿联酋", code: "AE", countryCode: "+971" },
  { name: "United Kingdom", nameZh: "英国", code: "GB", countryCode: "+44" },
  { name: "United States", nameZh: "美国", code: "US", countryCode: "+1" },
  { name: "Uruguay", nameZh: "乌拉圭", code: "UY", countryCode: "+598" },
  { name: "Uzbekistan", nameZh: "乌兹别克斯坦", code: "UZ", countryCode: "+998" },
  { name: "Vanuatu", nameZh: "瓦努阿图", code: "VU", countryCode: "+678" },
  { name: "Vatican City", nameZh: "梵蒂冈", code: "VA", countryCode: "+379" },
  { name: "Venezuela", nameZh: "委内瑞拉", code: "VE", countryCode: "+58" },
  { name: "Vietnam", nameZh: "越南", code: "VN", countryCode: "+84" },
  { name: "Yemen", nameZh: "也门", code: "YE", countryCode: "+967" },
  { name: "Zambia", nameZh: "赞比亚", code: "ZM", countryCode: "+260" },
  { name: "Zimbabwe", nameZh: "津巴布韦", code: "ZW", countryCode: "+263" },
];

export const getCountries = (language = 'en') => {
  return countryData.map(country => ({
    name: language === 'zh' ? country.nameZh : country.name,
    code: country.code,
    countryCode: country.countryCode,
  }));
};

export const getPopularCountries = (language = 'en') => {
  const popularCodes = ['CN', 'SG', 'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'IN'];
  return popularCodes.map(code => {
    const country = countryData.find(c => c.code === code);
    return {
      name: language === 'zh' ? country.nameZh : country.name,
      code: country.code,
      countryCode: country.countryCode,
    };
  });
};

export const countries = getCountries('en');
export const popularCountries = getPopularCountries('en');

export const getCountryByCode = (code, language = 'en') => {
  if (!code) return null;
  const country = countryData.find(c => c.code === code.toUpperCase());
  if (!country) return null;
  return {
    name: language === 'zh' ? country.nameZh : country.name,
    code: country.code,
    countryCode: country.countryCode,
  };
};

export const getCountryByName = (name) => {
  return countries.find(c => c.name === name) || null;
};

export const getCountryCodeByName = (name) => {
  const country = getCountryByName(name);
  return country ? country.countryCode : null;
};

export const getCountryCodeFromNameOrCode = (value, language = 'en') => {
  if (!value || typeof value !== 'string') return null;
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  if (/^[A-Z]{2}$/.test(trimmedValue)) {
    const country = countryData.find(c => c.code === trimmedValue);
    return country ? country.code : null;
  }

  const allCountries = getCountries(language);
  const exactMatch = allCountries.find(c => c.name.toLowerCase() === trimmedValue.toLowerCase());
  if (exactMatch) return exactMatch.code;

  if (language === 'en') {
    const chineseMatch = countryData.find(c => c.nameZh?.toLowerCase() === trimmedValue.toLowerCase());
    if (chineseMatch) return chineseMatch.code;
  } else if (language === 'zh') {
    const englishMatch = countryData.find(c => c.name?.toLowerCase() === trimmedValue.toLowerCase());
    if (englishMatch) return englishMatch.code;
  }

  return null;
};

export const searchCountries = (query, language = 'en', limit = null) => {
  const allCountries = getCountries(language);

  if (!query || query.trim() === '') {
    const sorted = [...allCountries].sort((a, b) => a.name.localeCompare(b.name));
    return limit ? sorted.slice(0, limit) : sorted;
  }

  const searchTerm = query.toLowerCase().trim();

  const matches = allCountries.filter(country => {
    const nameMatch = country.name.toLowerCase().includes(searchTerm);
    const codeMatch = country.code.toLowerCase() === searchTerm;
    const original = countryData.find(c => c.code === country.code);
    if (language === 'en') {
      return nameMatch || codeMatch || original?.nameZh?.toLowerCase().includes(searchTerm);
    }
    if (language === 'zh') {
      return nameMatch || codeMatch || original?.name?.toLowerCase().includes(searchTerm);
    }
    return nameMatch || codeMatch;
  });

  matches.sort((a, b) => a.name.localeCompare(b.name));
  return limit ? matches.slice(0, limit) : matches;
};
