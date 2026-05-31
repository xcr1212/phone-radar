window.phoneRadarSeed = {
  brands: ["全部", "iPhone", "Samsung", "Pixel", "Xiaomi", "OPPO", "vivo", "Huawei", "HONOR", "行业"],
  types: ["全部", "爆料", "官方", "参数", "评测", "市场报告"],
  trusts: ["全部", "官方确认", "监管/跑分", "高可信爆料", "媒体汇总", "待验证"],
  sources: [
    {
      name: "Apple Newsroom",
      group: "iPhone",
      kind: "官方",
      authority: "官方确认",
      focus: "iPhone 发布、功能和价格信息",
      url: "https://www.apple.com/newsroom/topics/iphone/",
      cadence: "发布会和产品更新时"
    },
    {
      name: "Apple Security Releases",
      group: "iPhone",
      kind: "官方",
      authority: "官方确认",
      focus: "iOS / iPadOS 安全更新",
      url: "https://support.apple.com/en-us/100100",
      cadence: "系统更新后"
    },
    {
      name: "Bloomberg Power On",
      group: "iPhone",
      kind: "爆料",
      authority: "高可信爆料",
      focus: "苹果路线图、发布时间、产品策略",
      url: "https://www.bloomberg.com/account/newsletters/power-on",
      cadence: "每周"
    },
    {
      name: "Ming-Chi Kuo",
      group: "iPhone",
      kind: "爆料",
      authority: "高可信爆料",
      focus: "供应链、零部件、出货量变化",
      url: "https://medium.com/@mingchikuo",
      cadence: "不定期"
    },
    {
      name: "ApplesClubs",
      group: "iPhone",
      kind: "X 爆料博主",
      authority: "高可信爆料",
      focus: "X 上的 Apple / iPhone 爆料、图片线索和发布前消息",
      url: "https://x.com/ApplesClubs",
      cadence: "不定期"
    },
    {
      name: "数码闲聊站",
      group: "爆料",
      kind: "微博爆料",
      authority: "高可信爆料",
      focus: "国产安卓新机、屏幕、电池、影像和芯片线索",
      url: "https://weibo.com/u/6048569942",
      cadence: "高频更新"
    },
    {
      name: "竹本青",
      group: "爆料",
      kind: "酷安博主",
      authority: "高可信爆料",
      focus: "酷安公开动态里的手机、新机、系统体验和硬件线索",
      url: "https://www.coolapk.com/u/4248714",
      cadence: "不定期"
    },
    {
      name: "JSCHEN小小狐",
      group: "爆料",
      kind: "酷安博主",
      authority: "高可信爆料",
      focus: "酷安公开动态里的手机、新机、系统体验和硬件线索",
      url: "https://www.coolapk.com/u/4702274",
      cadence: "不定期"
    },
    {
      name: "Ice Universe",
      group: "爆料",
      kind: "爆料人",
      authority: "高可信爆料",
      focus: "三星 Galaxy、屏幕、影像和外观线索",
      url: "https://x.com/UniverseIce",
      cadence: "不定期"
    },
    {
      name: "OnLeaks",
      group: "爆料",
      kind: "渲染图爆料",
      authority: "媒体汇总",
      focus: "未发布手机外观渲染图、机身尺寸和设计线索",
      url: "https://x.com/OnLeaks",
      cadence: "不定期"
    },
    {
      name: "Evan Blass",
      group: "爆料",
      kind: "爆料人",
      authority: "高可信爆料",
      focus: "发布前官方图、宣传图和新机命名线索",
      url: "https://x.com/evleaks",
      cadence: "不定期"
    },
    {
      name: "The Information",
      group: "iPhone",
      kind: "深度报道",
      authority: "高可信爆料",
      focus: "苹果内部规划和供应链报道",
      url: "https://www.theinformation.com/",
      cadence: "不定期"
    },
    {
      name: "Samsung Newsroom",
      group: "Samsung",
      kind: "官方",
      authority: "官方确认",
      focus: "Galaxy 新机、One UI、影像技术",
      url: "https://news.samsung.com/global/",
      cadence: "发布会和产品更新时"
    },
    {
      name: "SamMobile",
      group: "Samsung",
      kind: "媒体 / 爆料",
      authority: "媒体汇总",
      focus: "Galaxy 新机、One UI、固件、三星生态相关消息",
      url: "https://www.sammobile.com/",
      cadence: "高频更新"
    },
    {
      name: "Google Pixel Blog",
      group: "Pixel",
      kind: "官方",
      authority: "官方确认",
      focus: "Pixel 手机、Feature Drop、Android 功能",
      url: "https://blog.google/products-and-platforms/devices/pixel/",
      cadence: "发布会和月度更新时"
    },
    {
      name: "9to5Google",
      group: "Pixel",
      kind: "媒体 / 爆料",
      authority: "媒体汇总",
      focus: "Pixel、Android、Tensor、Google 硬件和发布前消息",
      url: "https://9to5google.com/",
      cadence: "高频更新"
    },
    {
      name: "GSMArena",
      group: "行业",
      kind: "参数 / 评测",
      authority: "媒体汇总",
      focus: "全球手机发布、参数、评测、跑分和影像样张",
      url: "https://www.gsmarena.com/",
      cadence: "高频更新"
    },
    {
      name: "PhoneArena",
      group: "行业",
      kind: "参数 / 评测",
      authority: "媒体汇总",
      focus: "主流手机参数、发布、评测和横向对比",
      url: "https://www.phonearena.com/",
      cadence: "高频更新"
    },
    {
      name: "Android Police",
      group: "行业",
      kind: "媒体 / 爆料",
      authority: "媒体汇总",
      focus: "Android 手机、Pixel、Galaxy、系统体验和新机消息",
      url: "https://www.androidpolice.com/",
      cadence: "高频更新"
    },
    {
      name: "Android Central",
      group: "行业",
      kind: "评测 / 体验",
      authority: "媒体汇总",
      focus: "Android 手机评测、购机建议、Pixel 和 Galaxy 动态",
      url: "https://www.androidcentral.com/",
      cadence: "高频更新"
    },
    {
      name: "Gizmochina",
      group: "行业",
      kind: "媒体 / 爆料",
      authority: "媒体汇总",
      focus: "国产安卓新机、海外发布、参数和认证线索",
      url: "https://www.gizmochina.com/",
      cadence: "高频更新"
    },
    {
      name: "Huawei Central",
      group: "行业",
      kind: "媒体 / 爆料",
      authority: "媒体汇总",
      focus: "Huawei / HarmonyOS / Mate / Pura 系列相关消息",
      url: "https://www.huaweicentral.com/",
      cadence: "高频更新"
    },
    {
      name: "The Verge",
      group: "行业",
      kind: "综合科技媒体",
      authority: "媒体汇总",
      focus: "主流手机发布、行业趋势和大厂产品线变化",
      url: "https://www.theverge.com/",
      cadence: "高频更新"
    },
    {
      name: "IDC Smartphone Tracker",
      group: "行业",
      kind: "市场报告",
      authority: "官方确认",
      focus: "手机市场份额和出货趋势",
      url: "https://www.idc.com/promo/smartphone-market-share/market-share/",
      cadence: "季度"
    },
    {
      name: "Counterpoint Research",
      group: "行业",
      kind: "市场报告",
      authority: "官方确认",
      focus: "地区销量、品牌份额、供应链趋势",
      url: "https://counterpointresearch.com/",
      cadence: "月度/季度"
    },
    {
      name: "iFixit",
      group: "评测",
      kind: "拆解",
      authority: "实测参考",
      focus: "拆解、维修难度、内部结构",
      url: "https://www.ifixit.com/News/",
      cadence: "新机上市后"
    },
    {
      name: "DXOMARK",
      group: "评测",
      kind: "实验室测试",
      authority: "实测参考",
      focus: "影像、屏幕、音频测试",
      url: "https://www.dxomark.com/smartphones/",
      cadence: "评测发布后"
    }
  ],
  news: [
    {
      id: "seed-iphone-roadmap",
      title: "示例：iPhone 未来机型路线图待跟踪",
      source: "Bloomberg Power On",
      brand: "iPhone",
      model: "iPhone 未来机型",
      type: "爆料",
      trust: "高可信爆料",
      date: "2026-05-28",
      url: "https://www.bloomberg.com/account/newsletters/power-on",
      summary: "适合记录 Gurman 对发布时间、产品线调整、系统功能和硬件路线的预测。发布后用 Apple 官方页校准。",
      tags: ["Apple", "路线图", "发布节奏"]
    },
    {
      id: "seed-kuo-supply",
      title: "示例：供应链变化和关键零部件传闻",
      source: "Ming-Chi Kuo",
      brand: "iPhone",
      model: "iPhone 未来机型",
      type: "爆料",
      trust: "高可信爆料",
      date: "2026-05-24",
      url: "https://medium.com/@mingchikuo",
      summary: "适合跟踪镜头、面板、调制解调器、出货量和量产时间点。信息发布后仍需等待官方参数或拆解补齐。",
      tags: ["供应链", "零部件", "出货"]
    },
    {
      id: "seed-apple-official",
      title: "示例：iPhone 官方发布稿归档",
      source: "Apple Newsroom",
      brand: "iPhone",
      model: "iPhone 已发布机型",
      type: "官方",
      trust: "官方确认",
      date: "2026-05-20",
      url: "https://www.apple.com/newsroom/topics/iphone/",
      summary: "发布当天把功能、价格、上市时间、颜色和地区信息放进这里，后续参数页再补完整规格。",
      tags: ["官方", "发布", "参数校准"]
    },
    {
      id: "seed-galaxy-official",
      title: "示例：Galaxy 发布后参数跟踪",
      source: "Samsung Newsroom",
      brand: "Samsung",
      model: "Galaxy S / Z 系列",
      type: "官方",
      trust: "官方确认",
      date: "2026-05-18",
      url: "https://news.samsung.com/global/",
      summary: "记录三星发布稿、产品页参数、One UI 功能和区域上市信息。",
      tags: ["Galaxy", "官方", "One UI"]
    },
    {
      id: "seed-pixel-official",
      title: "示例：Pixel Feature Drop 与新机信息",
      source: "Google Pixel Blog",
      brand: "Pixel",
      model: "Pixel 系列",
      type: "官方",
      trust: "官方确认",
      date: "2026-05-14",
      url: "https://blog.google/products-and-platforms/devices/pixel/",
      summary: "记录 Pixel 新功能、相机算法、Tensor 芯片和 Android 更新节奏。",
      tags: ["Pixel", "Android", "Feature Drop"]
    },
    {
      id: "seed-market",
      title: "示例：全球智能手机市场份额季度观察",
      source: "IDC / Counterpoint",
      brand: "行业",
      model: "智能手机市场",
      type: "市场报告",
      trust: "官方确认",
      date: "2026-05-10",
      url: "https://www.idc.com/promo/smartphone-market-share/market-share/",
      summary: "记录 iPhone、三星、小米、OPPO、vivo 等品牌份额变化，用来判断产品线走势。",
      tags: ["市场份额", "出货", "趋势"]
    },
    {
      id: "seed-benchmark",
      title: "示例：跑分或监管信息出现后建立待验证项",
      source: "Geekbench / FCC / TENAA",
      brand: "行业",
      model: "未发布机型",
      type: "参数",
      trust: "监管/跑分",
      date: "2026-05-08",
      url: "https://browser.geekbench.com/",
      summary: "记录型号、芯片代号、内存、无线频段等线索。正式发布前只当作参数参考。",
      tags: ["跑分", "监管", "型号"]
    }
  ],
  devices: [
    {
      id: "device-iphone-17",
      brand: "iPhone",
      model: "iPhone 17",
      status: "官方参数",
      release: "Apple 官方在售",
      chip: "A19 芯片",
      display: "6.3 英寸 Super Retina XDR，2622 x 1206，ProMotion 最高 120Hz，全天候显示",
      camera: "4800 万像素融合式双摄：主摄 + 超广角；1800 万像素 Center Stage 前置摄像头",
      battery: "视频播放最长 30 小时；20 分钟最多可充至 50%；MagSafe / Qi2 无线充电最高 15W",
      price: "256GB / 512GB；以 Apple 中国大陆官网实时价格为准",
      source: "Apple iPhone 17 技术规格",
      sourceUrl: "https://www.apple.com.cn/iphone-17/specs/",
      specs: {
        外观: "黑色、白色、青雾蓝色、鼠尾草绿色、薰衣草紫色；铝金属设计；超瓷晶面板 2 正面；融色玻璃背板。",
        处理器: "A19 芯片；6 核 CPU；5 核 GPU；16 核神经网络引擎。",
        屏幕: "6.3 英寸 OLED 全面屏；2622 x 1206，460 ppi；灵动岛；全天候显示；ProMotion 最高 120Hz；户外峰值亮度 3000 尼特。",
        影像: "4800 万像素融合式主摄 + 4800 万像素融合式超广角；2 倍光学品质长焦；1800 万像素 Center Stage 前置；最高 4K 杜比视界视频。",
        续航: "视频播放最长 30 小时；流媒体视频播放最长 27 小时；40W 或更大功率适配器可 20 分钟最多充至 50%；MagSafe / Qi2 最高 15W。",
        机身: "149.6 x 71.5 x 7.95 毫米；177 克；IP68；USB-C，支持 DisplayPort 和 USB 2。",
        其他: "Face ID；操作按钮；相机控制；Apple N1；Wi-Fi 7；蓝牙 6；Thread；第二代超宽带；双卡 nano-SIM。",
        价格: "容量 256GB / 512GB；价格以 Apple 中国大陆官网购买页实时显示为准。"
      }
    },
    {
      id: "device-iphone-air",
      brand: "iPhone",
      model: "iPhone Air",
      status: "官方参数",
      release: "Apple 官方在售",
      chip: "A19 Pro 芯片",
      display: "6.5 英寸 Super Retina XDR，2736 x 1260，ProMotion 最高 120Hz，全天候显示",
      camera: "4800 万像素融合式主摄；1800 万像素 Center Stage 前置摄像头",
      battery: "视频播放最长 27 小时；30 分钟最多可充至 50%；MagSafe / Qi2 无线充电最高 15W",
      price: "256GB / 512GB / 1TB；以 Apple 中国大陆官网实时价格为准",
      source: "Apple iPhone Air 技术规格",
      sourceUrl: "https://www.apple.com.cn/iphone-air/specs/",
      specs: {
        外观: "深空黑色、云白色、浅金色、天蓝色；钛金属设计；正面超瓷晶面板 2；背面超瓷晶面板。",
        处理器: "A19 Pro 芯片；6 核 CPU；5 核 GPU；16 核神经网络引擎。",
        屏幕: "6.5 英寸 OLED 全面屏；2736 x 1260，460 ppi；灵动岛；全天候显示；ProMotion 最高 120Hz；户外峰值亮度 3000 尼特。",
        影像: "4800 万像素融合式主摄；2 倍光学品质长焦；1800 万像素 Center Stage 前置；最高 4K 杜比视界视频。",
        续航: "视频播放最长 27 小时；搭配 iPhone Air 专用 MagSafe 电池最长 40 小时；20W 或更大功率适配器可 30 分钟最多充至 50%；MagSafe / Qi2 最高 15W。",
        机身: "156.2 x 74.7 x 5.64 毫米；165 克；IP68；USB-C，支持 USB 2。",
        其他: "Face ID；操作按钮；相机控制；Apple C1X 调制解调器；Apple N1；Wi-Fi 7；蓝牙 6；Thread；双 eSIM，不兼容实体 SIM 卡。",
        价格: "容量 256GB / 512GB / 1TB；价格以 Apple 中国大陆官网购买页实时显示为准。"
      }
    },
    {
      id: "device-iphone-17-pro",
      brand: "iPhone",
      model: "iPhone 17 Pro",
      status: "官方参数",
      release: "Apple 官方在售",
      chip: "A19 Pro 芯片",
      display: "6.3 英寸 Super Retina XDR，2622 x 1206，ProMotion 最高 120Hz，全天候显示",
      camera: "4800 万像素 Pro 级融合式三摄：主摄、超广角、长焦；1800 万像素 Center Stage 前置",
      battery: "视频播放最长 31 小时；20 分钟最多可充至 50%；MagSafe / Qi2 无线充电最高 15W",
      price: "256GB / 512GB / 1TB；以 Apple 中国大陆官网实时价格为准",
      source: "Apple iPhone 17 Pro 技术规格",
      sourceUrl: "https://www.apple.com.cn/iphone-17-pro/specs/",
      specs: {
        外观: "银色、星宇橙色、深蓝色；铝金属一体成型设计；正面超瓷晶面板 2；背面超瓷晶面板。",
        处理器: "A19 Pro 芯片；6 核 CPU；6 核 GPU；16 核神经网络引擎。",
        屏幕: "6.3 英寸 OLED 全面屏；2622 x 1206，460 ppi；灵动岛；全天候显示；ProMotion 最高 120Hz；户外峰值亮度 3000 尼特。",
        影像: "4800 万像素 Pro 级融合式三摄：主摄、超广角、长焦；4 倍长焦，8 倍光学品质变焦；最高 40 倍数码变焦；1800 万像素 Center Stage 前置。",
        续航: "视频播放最长 31 小时；流媒体视频播放最长 28 小时；40W 或更大功率适配器可 20 分钟最多充至 50%；MagSafe / Qi2 最高 15W。",
        机身: "150.0 x 71.9 x 8.75 毫米；204 克；IP68；USB-C，支持 DisplayPort 和 USB 3 最高 10Gb/s。",
        其他: "Face ID；操作按钮；相机控制；激光雷达扫描仪；Apple N1；Wi-Fi 7；蓝牙 6；Thread；第二代超宽带；双卡 nano-SIM。",
        价格: "容量 256GB / 512GB / 1TB；价格以 Apple 中国大陆官网购买页实时显示为准。"
      }
    },
    {
      id: "device-iphone-17-pro-max",
      brand: "iPhone",
      model: "iPhone 17 Pro Max",
      status: "官方参数",
      release: "Apple 官方在售",
      chip: "A19 Pro 芯片",
      display: "6.9 英寸 Super Retina XDR，2868 x 1320，ProMotion 最高 120Hz，全天候显示",
      camera: "4800 万像素 Pro 级融合式三摄：主摄、超广角、长焦；1800 万像素 Center Stage 前置",
      battery: "视频播放最长 37 小时；20 分钟最多可充至 50%；MagSafe / Qi2 无线充电最高 15W",
      price: "256GB / 512GB / 1TB / 2TB；以 Apple 中国大陆官网实时价格为准",
      source: "Apple iPhone 17 Pro Max 技术规格",
      sourceUrl: "https://www.apple.com.cn/iphone-17-pro/specs/",
      specs: {
        外观: "银色、星宇橙色、深蓝色；铝金属一体成型设计；正面超瓷晶面板 2；背面超瓷晶面板。",
        处理器: "A19 Pro 芯片；6 核 CPU；6 核 GPU；16 核神经网络引擎。",
        屏幕: "6.9 英寸 OLED 全面屏；2868 x 1320，460 ppi；灵动岛；全天候显示；ProMotion 最高 120Hz；户外峰值亮度 3000 尼特。",
        影像: "4800 万像素 Pro 级融合式三摄：主摄、超广角、长焦；4 倍长焦，8 倍光学品质变焦；最高 40 倍数码变焦；1800 万像素 Center Stage 前置。",
        续航: "视频播放最长 37 小时；流媒体视频播放最长 33 小时；40W 或更大功率适配器可 20 分钟最多充至 50%；MagSafe / Qi2 最高 15W。",
        机身: "163.4 x 78.0 x 8.75 毫米；231 克；IP68；USB-C，支持 DisplayPort 和 USB 3 最高 10Gb/s。",
        其他: "Face ID；操作按钮；相机控制；激光雷达扫描仪；Apple N1；Wi-Fi 7；蓝牙 6；Thread；第二代超宽带；双卡 nano-SIM。",
        价格: "容量 256GB / 512GB / 1TB / 2TB；价格以 Apple 中国大陆官网购买页实时显示为准。"
      }
    },
    {
      id: "device-iphone-17e",
      brand: "iPhone",
      model: "iPhone 17e",
      status: "官方参数",
      release: "Apple 官方在售",
      chip: "A19 芯片",
      display: "6.1 英寸 Super Retina XDR，2532 x 1170，60Hz",
      camera: "4800 万像素融合式摄像头系统；1200 万像素原深感前置摄像头",
      battery: "视频播放最长 26 小时；30 分钟最多可充至 50%；MagSafe / Qi2 无线充电最高 15W",
      price: "256GB / 512GB；以 Apple 中国大陆官网实时价格为准",
      source: "Apple iPhone 17e 技术规格",
      sourceUrl: "https://www.apple.com.cn/iphone-17e/specs/",
      specs: {
        外观: "黑色、白色、浅粉色；铝金属设计；超瓷晶面板 2 正面；玻璃背板。",
        处理器: "A19 芯片；6 核 CPU；4 核 GPU；16 核神经网络引擎。",
        屏幕: "6.1 英寸 OLED 全面屏；2532 x 1170，460 ppi；HDR；原彩显示；P3 广色域；峰值亮度 1200 尼特 HDR。",
        影像: "4800 万像素融合式主摄；2 倍长焦；最高 10 倍数码变焦；1200 万像素原深感前置；最高 4K 杜比视界视频。",
        续航: "视频播放最长 26 小时；流媒体视频播放最长 21 小时；20W 或更大功率适配器可 30 分钟最多充至 50%；MagSafe / Qi2 最高 15W。",
        机身: "146.7 x 71.5 x 7.80 毫米；170 克；IP68；USB-C，支持 USB 2。",
        其他: "Face ID；操作按钮；Apple C1X 调制解调器；Wi-Fi 6；蓝牙 5.3；双卡 nano-SIM + eSIM；支持双 eSIM。",
        价格: "容量 256GB / 512GB；价格以 Apple 中国大陆官网购买页实时显示为准。"
      }
    }
  ]
};
