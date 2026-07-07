// ─── Field Inference Engine ───
// Maps Chinese research keywords, department names, and research topics
// to Field slugs in the database. Used by the scraper and scheduler to
// automatically assign field associations to scholars.
//
// The mapping is organized by:
//   1. Research topic keywords → field slug
//   2. Department name patterns → field slug
//   3. Publication venue patterns → field slug

interface KeywordRule {
  /** Regex pattern to match against Chinese text */
  pattern: RegExp;
  /** Target field slug */
  field: string;
  /** Confidence weight (0-1). Higher = more specific match. */
  confidence: number;
}

// ─── Research Keyword → Field Mapping ───
// Ordered by specificity (more specific patterns first)

const RESEARCH_KEYWORD_RULES: KeywordRule[] = [
  // ── AI / ML / CV / NLP ──
  { pattern: /自然语言处理|NLP|文本分析|语义理解|机器翻译|信息抽取|情感分析|问答系统/, field: 'natural-language-processing', confidence: 0.9 },
  { pattern: /计算机视觉|图像识别|目标检测|图像分割|视频分析|视觉感知|三维视觉|图像处理|视觉计算|模式识别/, field: 'computer-vision', confidence: 0.9 },
  { pattern: /强化学习|深度强化|reinforcement.learning|策略梯度/, field: 'reinforcement-learning', confidence: 0.9 },
  { pattern: /机器学习|深度学习|神经网络|迁移学习|表示学习|联邦学习|元学习|对比学习/, field: 'machine-learning', confidence: 0.85 },
  { pattern: /人工智能|智能系统|知识图谱|知识工程|认知计算/, field: 'artificial-intelligence', confidence: 0.8 },

  // ── Systems / Networks / Security ──
  { pattern: /分布式系统|分布式计算|云计算|边缘计算|雾计算|并行计算/, field: 'distributed-systems', confidence: 0.85 },
  { pattern: /计算机网络|网络协议|软件定义网络|SDN|网络功能虚拟化|物联网|IoT|车联网/, field: 'computer-networks', confidence: 0.85 },
  { pattern: /操作系统|系统软件|内核|虚拟化|容器/, field: 'operating-systems', confidence: 0.9 },
  { pattern: /密码学|加密|信息安全|网络安全|入侵检测|隐私保护|区块链|零知识|安全多方/, field: 'cryptography', confidence: 0.85 },
  { pattern: /网络空间安全|信息对抗|安全审计|可信计算/, field: 'cybersecurity', confidence: 0.85 },
  { pattern: /系统与网络|计算机网络|分布式/, field: 'systems-and-networks', confidence: 0.7 },

  // ── Algorithms / Theory ──
  { pattern: /算法设计与分析|近似算法|随机算法|图算法|组合优化|计算复杂性|NP/, field: 'algorithms', confidence: 0.8 },
  { pattern: /计算复杂性|复杂度理论|P.?=?NP|下界/, field: 'computational-complexity', confidence: 0.9 },
  { pattern: /理论计算机|自动机|形式化方法|程序验证|形式语义|类型论|λ演算/, field: 'theory', confidence: 0.85 },

  // ── Hardware / EE ──
  { pattern: /电子工程|电路设计|嵌入式系统|VLSI|FPGA|集成电路|信号处理|通信系统/, field: 'electronic-engineering', confidence: 0.8 },
  { pattern: /量子计算|量子算法|量子纠错|量子 supremacy|量子模拟/, field: 'quantum-computing', confidence: 0.9 },
  { pattern: /量子信息|量子通信|量子密钥/, field: 'quantum-information', confidence: 0.85 },

  // ── Math ──
  { pattern: /概率论|数理统计|随机过程|统计推断|贝叶斯统计/, field: 'probability', confidence: 0.85 },
  { pattern: /代数学|群论|环论|域论|李代数|表示论|交换代数|同调代数/, field: 'algebra', confidence: 0.9 },
  { pattern: /数论|解析数论|代数数论|丢番图|模形式/, field: 'number-theory', confidence: 0.9 },
  { pattern: /代数几何|概形|代数簇|相交理论|Hodge理论/, field: 'algebraic-geometry', confidence: 0.9 },
  { pattern: /几何学|微分几何|黎曼几何|辛几何|拓扑/, field: 'geometry', confidence: 0.85 },
  { pattern: /数学|应用数学|计算数学|运筹学|数值分析|偏微分方程|动力系统/, field: 'mathematics', confidence: 0.7 },

  // ── Physics ──
  { pattern: /量子物理|量子力学|量子场论|量子电动力学/, field: 'quantum-physics', confidence: 0.9 },
  { pattern: /量子光学|光量子|光子学|量子调控/, field: 'quantum-optics', confidence: 0.9 },
  { pattern: /凝聚态物理|超导|拓扑绝缘体|强关联|自旋电子学|磁性材料/, field: 'condensed-matter', confidence: 0.9 },
  { pattern: /高能物理|粒子物理|标准模型|对撞机|中微子|暗物质|超对称|弦论/, field: 'high-energy-physics', confidence: 0.9 },
  { pattern: /粒子物理|基本粒子|夸克|轻子|规范场/, field: 'particle-physics', confidence: 0.9 },
  { pattern: /物理[学]|理论物理|声学|热学|电磁学|光学|原子分子物理/, field: 'physics', confidence: 0.7 },

  // ── Chemistry ──
  { pattern: /催化|光催化|电催化|多相催化|均相催化|催化剂/, field: 'catalysis', confidence: 0.9 },
  { pattern: /有机化学|有机合成|天然产物|全合成|有机反应/, field: 'organic-chemistry', confidence: 0.85 },
  { pattern: /无机化学|配位化学|金属有机|团簇/, field: 'inorganic-chemistry', confidence: 0.85 },
  { pattern: /物理化学|化学热力学|化学动力学|表面化学|胶体/, field: 'physical-chemistry', confidence: 0.85 },
  { pattern: /天然产物|次生代谢产物|活性天然产物|生源合成/, field: 'natural-products', confidence: 0.9 },
  { pattern: /合成方法|合成方法学|有机方法学|合成策略/, field: 'synthetic-methods', confidence: 0.9 },
  { pattern: /化学|分析化学|高分子化学|环境化学|核化学/, field: 'chemistry', confidence: 0.7 },

  // ── Biology / Medicine ──
  { pattern: /基因组学|基因组|转录组|表观基因组|宏基因组/, field: 'genomics', confidence: 0.9 },
  { pattern: /蛋白质组学|蛋白质|蛋白组/, field: 'proteomics', confidence: 0.9 },
  { pattern: /分子生物学|基因表达|DNA复制|RNA|转录因子/, field: 'molecular-biology', confidence: 0.85 },
  { pattern: /基因编辑|CRISPR|Cas9|碱基编辑/, field: 'gene-editing', confidence: 0.9 },
  { pattern: /神经科学|脑科学|突触|神经元|动作电位/, field: 'neuroscience', confidence: 0.8 },
  { pattern: /认知神经科学|认知功能|脑成像|fMRI|EEG|认知障碍/, field: 'cognitive-neuroscience', confidence: 0.9 },
  { pattern: /计算神经科学|神经编码|神经回路|神经计算模型/, field: 'computational-neuroscience', confidence: 0.9 },
  { pattern: /肿瘤学|癌症|肿瘤|癌变|抑癌|致癌/, field: 'oncology', confidence: 0.85 },
  { pattern: /精准肿瘤|精准医学|靶向治疗|个体化治疗|分子分型/, field: 'precision-oncology', confidence: 0.9 },
  { pattern: /免疫治疗|CAR.?T|PD.?1|免疫检查点|癌症疫苗/, field: 'immunotherapy', confidence: 0.9 },
  { pattern: /流行病学|疾病流行|发病率|患病率|危险因素|队列研究/, field: 'epidemiology', confidence: 0.85 },
  { pattern: /神经外科|脑外科|开颅|脑肿瘤手术|脊柱外科/, field: 'neurosurgery', confidence: 0.9 },
  { pattern: /外科手术|微创手术|腹腔镜|内窥镜|关节镜/, field: 'medicine', confidence: 0.7 },
  { pattern: /肿瘤|癌症|癌|瘤|化疗|放疗|靶向治疗/, field: 'oncology', confidence: 0.7 },
  { pattern: /心血管|心脏|冠状动脉|心肌|心率|血压|血管|心电图|心电/, field: 'medicine', confidence: 0.65 },
  { pattern: /骨折|骨科|创伤|关节|韧带|半月板|骨折/, field: 'medicine', confidence: 0.65 },
  { pattern: /移植|器官移植|肝移植|肾移植|骨髓移植/, field: 'medicine', confidence: 0.7 },
  { pattern: /药[理学物]|药学|药物|中药|西药|抗生素|抗菌|抗病毒/, field: 'medicine', confidence: 0.6 },
  { pattern: /护理|护士|护长/, field: 'medicine', confidence: 0.55 },
  { pattern: /生物[学]|细胞生物学|遗传学|发育生物学|微生物学/, field: 'biology', confidence: 0.7 },
  { pattern: /医学|临床医学|基础医学|内科学|外科学|病理学|诊断|治疗|疗效/, field: 'medicine', confidence: 0.65 },

  // ── Economics ──
  { pattern: /微观经济|消费者理论|厂商理论|博弈论|信息经济学|机制设计/, field: 'microeconomics', confidence: 0.9 },
  { pattern: /宏观经济|经济增长|经济周期|货币政策|财政政策|通胀|GDP/, field: 'macroeconomics', confidence: 0.9 },
  { pattern: /计量经济|回归分析|工具变量|面板数据|时间序列分析|因果推断/, field: 'econometrics', confidence: 0.85 },
  { pattern: /经济[学]|政治经济|劳动经济|发展经济|区域经济/, field: 'economics', confidence: 0.7 },

  // ── Network Engineering ──
  { pattern: /网络工程|网络架构|网络规划|网络优化|通信网络/, field: 'network-engineering', confidence: 0.8 },

  // ── Broad CS (catch-all, lowest confidence) ──
  { pattern: /计算机|软件工程|程序设计|数据库|数据结构|编译|人机交互/, field: 'computer-science', confidence: 0.6 },

  // ── English keyword rules (for OpenAlex paper titles) ──
  // AI/ML/CV/NLP
  { pattern: /\b(?:natural language processing|NLP|text mining|semantic parsing|machine translation|information extraction|sentiment analysis|question answering)\b/i, field: 'natural-language-processing', confidence: 0.85 },
  { pattern: /\b(?:computer vision|image recognition|object detection|image segmentation|video analysis|visual perception|3D vision|image processing|visual computing|pattern recognition)\b/i, field: 'computer-vision', confidence: 0.85 },
  { pattern: /\b(?:reinforcement learning|deep reinforcement|policy gradient|RL)\b/i, field: 'reinforcement-learning', confidence: 0.85 },
  { pattern: /\b(?:machine learning|deep learning|neural network|transfer learning|representation learning|federated learning|meta.?learning|contrastive learning)\b/i, field: 'machine-learning', confidence: 0.8 },
  { pattern: /\b(?:artificial intelligence|intelligent system|knowledge graph|knowledge engineering|cognitive computing)\b/i, field: 'artificial-intelligence', confidence: 0.75 },

  // Systems / Networks / Security
  { pattern: /\b(?:distributed system|distributed computing|cloud computing|edge computing|fog computing|parallel computing)\b/i, field: 'distributed-systems', confidence: 0.8 },
  { pattern: /\b(?:computer network|network protocol|software.defined network|SDN|network function virtualization|IoT|Internet of Things|vehicular network)\b/i, field: 'computer-networks', confidence: 0.8 },
  { pattern: /\b(?:operating system|system software|kernel|virtualization|container)\b/i, field: 'operating-systems', confidence: 0.85 },
  { pattern: /\b(?:cryptography|encryption|information security|network security|intrusion detection|privacy|blockchain|zero.?knowledge|secure multi.?party)\b/i, field: 'cryptography', confidence: 0.8 },
  { pattern: /\b(?:cyber.?security|cyber.?attack|security audit|trusted computing)\b/i, field: 'cybersecurity', confidence: 0.8 },

  // Algorithms / Theory
  { pattern: /\b(?:algorithm design|approximation algorithm|randomized algorithm|graph algorithm|combinatorial optimization|computational complexity)\b/i, field: 'algorithms', confidence: 0.75 },
  { pattern: /\b(?:formal method|program verification|formal semantics|type theory|lambda calculus|automata theory)\b/i, field: 'theory', confidence: 0.8 },

  // Hardware / EE
  { pattern: /\b(?:electronic engineering|circuit design|embedded system|VLSI|FPGA|integrated circuit|signal processing|communication system)\b/i, field: 'electronic-engineering', confidence: 0.75 },
  { pattern: /\b(?:quantum computing|quantum algorithm|quantum error correction|quantum supremacy|quantum simulation)\b/i, field: 'quantum-computing', confidence: 0.85 },

  // Math
  { pattern: /\b(?:probability theory|mathematical statistics|stochastic process|statistical inference|Bayesian statistics)\b/i, field: 'probability', confidence: 0.8 },
  { pattern: /\b(?:algebra|group theory|ring theory|field theory|Lie algebra|representation theory|commutative algebra|homological algebra)\b/i, field: 'algebra', confidence: 0.85 },
  { pattern: /\b(?:number theory|analytic number theory|algebraic number theory|Diophantine|modular form)\b/i, field: 'number-theory', confidence: 0.85 },
  { pattern: /\b(?:algebraic geometry|scheme|algebraic variety|intersection theory|Hodge theory)\b/i, field: 'algebraic-geometry', confidence: 0.85 },
  { pattern: /\b(?:differential geometry|Riemannian geometry|symplectic geometry|topology)\b/i, field: 'geometry', confidence: 0.8 },
  { pattern: /\b(?:applied mathematics|computational mathematics|operations research|numerical analysis|partial differential equation|dynamical system)\b/i, field: 'mathematics', confidence: 0.65 },

  // Physics
  { pattern: /\b(?:quantum physics|quantum mechanics|quantum field theory|quantum electrodynamics)\b/i, field: 'quantum-physics', confidence: 0.85 },
  { pattern: /\b(?:quantum optics|photonic|quantum control)\b/i, field: 'quantum-optics', confidence: 0.85 },
  { pattern: /\b(?:condensed matter|superconduct|topological insulator|strongly correlated|spintronic|magnetic material)\b/i, field: 'condensed-matter', confidence: 0.85 },
  { pattern: /\b(?:high.energy physics|particle physics|standard model|collider|neutrino|dark matter|supersymmetry|string theory)\b/i, field: 'high-energy-physics', confidence: 0.85 },

  // Chemistry
  { pattern: /\b(?:catalysis|photocatalysis|electrocatalysis|heterogeneous catalysis|homogeneous catalysis|catalyst)\b/i, field: 'catalysis', confidence: 0.85 },
  { pattern: /\b(?:organic chemistry|organic synthesis|natural product|total synthesis)\b/i, field: 'organic-chemistry', confidence: 0.8 },
  { pattern: /\b(?:inorganic chemistry|coordination chemistry|organometallic|cluster)\b/i, field: 'inorganic-chemistry', confidence: 0.8 },
  { pattern: /\b(?:physical chemistry|chemical thermodynamics|chemical kinetics|surface chemistry|colloid)\b/i, field: 'physical-chemistry', confidence: 0.8 },

  // Biology / Medicine
  { pattern: /\b(?:genomics|genome|transcriptom|epigenom|metagenom)\b/i, field: 'genomics', confidence: 0.85 },
  { pattern: /\b(?:proteomics|proteome)\b/i, field: 'proteomics', confidence: 0.85 },
  { pattern: /\b(?:molecular biology|gene expression|DNA replication|RNA|transcription factor)\b/i, field: 'molecular-biology', confidence: 0.8 },
  { pattern: /\b(?:gene editing|CRISPR|Cas9|base editing)\b/i, field: 'gene-editing', confidence: 0.85 },
  { pattern: /\b(?:neuroscience|brain science|synapse|neuron|action potential)\b/i, field: 'neuroscience', confidence: 0.75 },
  { pattern: /\b(?:cognitive neuroscience|cognitive function|brain imaging|fMRI|EEG|cognitive impairment)\b/i, field: 'cognitive-neuroscience', confidence: 0.85 },
  { pattern: /\b(?:computational neuroscience|neural coding|neural circuit|neural computation)\b/i, field: 'computational-neuroscience', confidence: 0.85 },
  { pattern: /\b(?:oncology|cancer|tumor|carcinogenesis|carcinogenic|chemotherapy|radiotherapy)\b/i, field: 'oncology', confidence: 0.75 },
  { pattern: /\b(?:precision oncology|precision medicine|targeted therapy|personalized medicine|molecular subtyp)\b/i, field: 'precision-oncology', confidence: 0.85 },
  { pattern: /\b(?:immunotherapy|CAR.?T|PD.?1|immune checkpoint|cancer vaccine)\b/i, field: 'immunotherapy', confidence: 0.85 },
  { pattern: /\b(?:epidemiology|disease prevalence|incidence|morbidity|risk factor|cohort study)\b/i, field: 'epidemiology', confidence: 0.8 },
  { pattern: /\b(?:neurosurgery|brain surgery|craniotomy|brain tumor surgery|spine surgery)\b/i, field: 'neurosurgery', confidence: 0.85 },
  { pattern: /\b(?:surgery|surgical|transplantation|transplant|orthopedic|arthroscopy|endoscopy|laparoscop)\b/i, field: 'medicine', confidence: 0.6 },
  { pattern: /\b(?:clinical|diagnosis|diagnostic|therapeutic|treatment outcome|prognosis|patient)\b/i, field: 'medicine', confidence: 0.55 },
  { pattern: /\b(?:cardiac|cardiovascular|coronary|myocardial|heart failure|arrhythmia|stent|ECG|electrocardiogram)\b/i, field: 'medicine', confidence: 0.6 },
  { pattern: /\b(?:pharmacy|pharmaceutical|drug|antibiotic|antiviral|antimicrobial)\b/i, field: 'medicine', confidence: 0.55 },
  { pattern: /\b(?:nursing|nurse|cancer nursing|clinical care)\b/i, field: 'medicine', confidence: 0.5 },
  { pattern: /\b(?:fracture|orthopedic|bone graft|internal fixation|arthroscopy)\b/i, field: 'medicine', confidence: 0.55 },
  { pattern: /\b(?:cell biology|stem cell|mesenchymal|progenitor|differentiation|proliferation|apoptosis)\b/i, field: 'biology', confidence: 0.65 },
  { pattern: /\b(?:microbiology|bacteria|fungal|virus|viral|pathogen|antimicrobial|antibiotic)\b/i, field: 'biology', confidence: 0.65 },

  // Economics
  { pattern: /\b(?:microeconomic|consumer theory|game theory|mechanism design|information economics)\b/i, field: 'microeconomics', confidence: 0.85 },
  { pattern: /\b(?:macroeconomic|economic growth|business cycle|monetary policy|fiscal policy|inflation|GDP)\b/i, field: 'macroeconomics', confidence: 0.85 },
  { pattern: /\b(?:econometrics|regression analysis|instrumental variable|panel data|time series analysis|causal inference)\b/i, field: 'econometrics', confidence: 0.8 },

  // Materials Science — correctly mapped (was chemistry)
  { pattern: /材料科学|纳米材料|薄膜材料|复合材料|高分子材料|陶瓷|合金|高熵合金|铁电|压电|形状记忆|生物材料|光催化材料|储能材料|2D材料|钙钛矿|二维材料|石墨烯|碳纳米管/i, field: 'materials-science', confidence: 0.8 },
  { pattern: /\b(?:materials science|nanomaterial|thin film|polymer|composite material|ceramic|alloy|entropy alloy|ferroelectric|piezoelectric|graphene|carbon nanotube|2D material|perovskite)\b/i, field: 'materials-science', confidence: 0.8 },

  // Optics / Photonics
  { pattern: /\b(?:laser|optics|optical|interferomet|photonic|photoacoustic|ultrasonic transducer|fiber optic|infrared)\b/i, field: 'quantum-optics', confidence: 0.6 },

  // Agriculture / Environment
  { pattern: /\b(?:soil|fertilizer|crop|cultivation|plant disease|rhizosphere|grassland)\b/i, field: 'biology', confidence: 0.5 },

  // Broad CS catch-all (English)
  { pattern: /\b(?:computer science|software engineering|programming|database|data structure|compiler|human.computer interaction)\b/i, field: 'computer-science', confidence: 0.55 },

  // Additional broad single-keyword patterns (lower confidence, but catch more)
  // Math — broader
  { pattern: /\b(?:stochastic|logistic model|delay model|impulsive perturbation|perturbation|differential equation|dynamical system|numerical simulation|bifurcation|chaos|fractal)\b/i, field: 'mathematics', confidence: 0.45 },
  // Computer systems / hardware
  { pattern: /\b(?:data race|race detection|parallel computing|shared memory|concurrent|synchronization)\b/i, field: 'distributed-systems', confidence: 0.5 },
  { pattern: /\b(?:hardware|circuit|VLSI|chip design|microprocessor|memory hierarchy)\b/i, field: 'electronic-engineering', confidence: 0.5 },
  // Medicine — broader
  { pattern: /\b(?:Keshan disease|Kawasaki|congenital|chronic disease|serum|IgM|IgG|ELISA|immunoassay|biomarker)\b/i, field: 'medicine', confidence: 0.5 },
  { pattern: /\b(?:blood type|blood transfusion|transfusion|hemoglobin|platelet|coagulation)\b/i, field: 'medicine', confidence: 0.5 },
  { pattern: /\b(?:ultrasound|ultrasonography|sonograph|biopsy|prostate biopsy|perineal)\b/i, field: 'medicine', confidence: 0.5 },
  { pattern: /\b(?:vitamin|retinol|calciferol|tocopherol|nutrient deficiency|serum level)\b/i, field: 'medicine', confidence: 0.45 },
  { pattern: /\b(?:thrombin|retinal pigment epithelial|RPE cell|ocular|ophthalmolog)\b/i, field: 'medicine', confidence: 0.5 },
  { pattern: /\b(?:facial nerve|facial paralysis|Bell.palsy|recurrent facial paralysis)\b/i, field: 'medicine', confidence: 0.55 },
  // Microbiology
  { pattern: /\b(?:Staphylococcus aureus|S\. aureus|bacteria|antibiotic resistance|restriction.modification system)\b/i, field: 'biology', confidence: 0.5 },
  { pattern: /\b(?:Verticillium dahliae|fungal|mycology|phytopathogen)\b/i, field: 'biology', confidence: 0.5 },
  // Agriculture
  { pattern: /\b(?:chrysanthemum|cultivation|dry matter|greenhouse|crop simulation|maize|tassel|corn)\b/i, field: 'biology', confidence: 0.4 },
  { pattern: /\b(?:apple orchard|orchard|wireless signal|agricultural|precision agriculture)\b/i, field: 'biology', confidence: 0.4 },
  // Nuclear / Radiochemistry
  { pattern: /\b(?:uranium|radioactive nuclide|radiochemistry|nuclear fuel|Davies.Gray|potentiometric titration)\b/i, field: 'chemistry', confidence: 0.5 },
  // Linguistics / Humanities — correctly mapped (was computer-science)
  { pattern: /语言学|语法学|语义学|语音学|词汇学|方言|应用语言学|计算语言学|语料库|二语习得|翻译学|比较文学|文艺学|古典文学|现当代文学/i, field: 'linguistics', confidence: 0.8 },
  { pattern: /\b(?:linguistics|syntax|semantics|phonetics|phonology|morphology|dialectology|applied linguistics|computational linguistics|corpus|SLA|second language acquisition|translation studies)\b/i, field: 'linguistics', confidence: 0.75 },
  { pattern: /\b(?:Old English|Middle English|Latin|metrical calendar|Polychronicon|medieval literature|philolog|comparative literature|literary criticism)\b/i, field: 'literature', confidence: 0.7 },
  // Philosophy
  { pattern: /哲学|伦理学|逻辑学|形而上学|认识论|美学|中国哲学|西方哲学|马克思主义哲学|道德哲学/i, field: 'philosophy', confidence: 0.85 },
  { pattern: /\b(?:philosophy|ethics|logic|metaphysics|epistemology|aesthetics|moral philosophy)\b/i, field: 'philosophy', confidence: 0.8 },
  // History
  { pattern: /历史|考古|中国史|世界史|文物|博物馆|断代|史料|文献|古代|近代|中世纪|明清|民国/i, field: 'history', confidence: 0.8 },
  { pattern: /\b(?:history|archaeology|medieval|ancient|modern history|historiography|artifact)\b/i, field: 'history', confidence: 0.75 },
  // Law
  { pattern: /法学|法律|宪法|刑法|民法|经济法|行政法|国际法|知识产权法|诉讼法|法理|法制|立法|司法|仲裁/i, field: 'law', confidence: 0.8 },
  { pattern: /\b(?:law|constitutional law|criminal law|civil law|administrative law|international law|intellectual property|litigation|arbitration|jurisprudence)\b/i, field: 'law', confidence: 0.75 },
  // Management
  { pattern: /管理学|工商管理|企业管理|战略管理|人力资源管理|财务管理|市场营销|供应链|运营管理|项目管理|组织行为|公共管理/i, field: 'management', confidence: 0.8 },
  { pattern: /\b(?:management|business administration|strategic management|HR management|financial management|marketing|supply chain|operations management|project management|organizational behavior)\b/i, field: 'management', confidence: 0.75 },
  // Arts
  { pattern: /艺术|美术|音乐|舞蹈|设计|雕塑|绘画|书法|摄影|影视|动画|艺术史|艺术理论|设计学|视觉传达/i, field: 'arts', confidence: 0.8 },
  { pattern: /\b(?:art|fine art|music|dance|design|sculpture|painting|calligraphy|photography|film|animation|art history|visual communication)\b/i, field: 'arts', confidence: 0.75 },
  // Education
  { pattern: /教育学|教育|高等教育|基础教育|教育技术|教育管理|课程与教学|教师教育|特殊教育|比较教育|教育心理/i, field: 'education', confidence: 0.8 },
  { pattern: /\b(?:education|higher education|elementary education|educational technology|curriculum|teacher education|special education|educational psychology)\b/i, field: 'education', confidence: 0.75 },
  // Civil Engineering — correctly mapped (was electronic-engineering)
  { pattern: /土木工程|结构工程|岩土工程|桥梁工程|隧道工程|抗震|地震工程|混凝土|钢结构|地基|道路工程|交通工程|水利工程|市政工程/i, field: 'civil-engineering', confidence: 0.8 },
  { pattern: /\b(?:civil engineering|structural engineering|geotechnical|bridge engineering|tunnel engineering|seismic|earthquake engineering|gravity dam|structural analysis|concrete|traffic engineering|hydraulic engineering)\b/i, field: 'civil-engineering', confidence: 0.75 },
  // Mechanical Engineering
  { pattern: /机械工程|机械设计|机械制造|机电一体化|数控|摩擦学|动力学|振动|车辆工程|发动机|传热|流体机械/i, field: 'mechanical-engineering', confidence: 0.8 },
  { pattern: /\b(?:mechanical engineering|machine design|manufacturing|mechatronics|CNC|tribology|vibration|vehicle engineering|heat transfer|fluid machinery)\b/i, field: 'mechanical-engineering', confidence: 0.75 },
  // Aerospace Engineering
  { pattern: /航空航天|飞行器|航天器|火箭|卫星|无人机|空气动力学|推进|导航制导|航空发动机|空间科学/i, field: 'aerospace-engineering', confidence: 0.85 },
  { pattern: /\b(?:aerospace|aeronautic|astronautic|spacecraft|rocket|satellite|UAV|aerodynamic|propulsion|guidance navigation|aircraft engine|space science)\b/i, field: 'aerospace-engineering', confidence: 0.8 },
  // Electrical Engineering
  { pattern: /\b(?:distribution network|power grid|power system|open capacity|N-1 security|reconfiguration)\b/i, field: 'electronic-engineering', confidence: 0.5 },
  // EGFR / Molecular
  { pattern: /\b(?:EGFR|epidermal growth factor|antibody|MM-PBSA|molecular docking|binding affinity)\b/i, field: 'biology', confidence: 0.5 },
  // Rural health / Pharmacy
  { pattern: /\b(?:apothecary|certified pharmacist|rural health|health workforce|rural doctor)\b/i, field: 'medicine', confidence: 0.5 },
];

// ─── Department Name → Field Mapping ───

const DEPARTMENT_FIELD_MAP: Array<{ deptPattern: RegExp; field: string; confidence: number }> = [
  { deptPattern: /计算机|计[算科]学|信息[^管经]/i, field: 'computer-science', confidence: 0.7 },
  { deptPattern: /人工智能|智能科学|智能技术/i, field: 'artificial-intelligence', confidence: 0.85 },
  { deptPattern: /电子[工程信]|电信|微电子/i, field: 'electronic-engineering', confidence: 0.8 },
  { deptPattern: /数学|数理|应用数学/i, field: 'mathematics', confidence: 0.8 },
  { deptPattern: /物理|应用物理|工程物理/i, field: 'physics', confidence: 0.8 },
  { deptPattern: /化学|化工|应用化学/i, field: 'chemistry', confidence: 0.8 },
  { deptPattern: /生物[学命医]|生命科学/i, field: 'biology', confidence: 0.75 },
  { deptPattern: /医学|临床|基础医学|药学|中医药/i, field: 'medicine', confidence: 0.75 },
  { deptPattern: /安全|密码|网安/i, field: 'cybersecurity', confidence: 0.85 },
  { deptPattern: /软件|软件工程/i, field: 'computer-science', confidence: 0.7 },
  { deptPattern: /经济|金融|经管|管理[^科学]/i, field: 'economics', confidence: 0.7 },
  { deptPattern: /自动化|控制/i, field: 'computer-science', confidence: 0.6 },
  { deptPattern: /通信|信息与通信/i, field: 'electronic-engineering', confidence: 0.7 },
  { deptPattern: /网络[工程]*?$/i, field: 'network-engineering', confidence: 0.8 },
  { deptPattern: /分布式|并行计算|并行与分布/i, field: 'distributed-systems', confidence: 0.85 },
  { deptPattern: /数据[科学库]|大数据/i, field: 'computer-science', confidence: 0.7 },
  { deptPattern: /材料|纳米/i, field: 'materials-science', confidence: 0.8 },
  { deptPattern: /环境|生态/i, field: 'chemistry', confidence: 0.6 },
  { deptPattern: /能源|动力|热[能工]/i, field: 'mechanical-engineering', confidence: 0.6 },
  { deptPattern: /机械|制造|机电/i, field: 'mechanical-engineering', confidence: 0.75 },
  { deptPattern: /土木|建筑|结构|交通|道路|桥梁/i, field: 'civil-engineering', confidence: 0.75 },
  { deptPattern: /航空航天|飞行器|航天|航空/i, field: 'aerospace-engineering', confidence: 0.8 },
  { deptPattern: /法学|法律|法[学政]/i, field: 'law', confidence: 0.8 },
  { deptPattern: /管理[^科学]/i, field: 'management', confidence: 0.7 },
  { deptPattern: /哲学|伦理/i, field: 'philosophy', confidence: 0.85 },
  { deptPattern: /历史|考古|文物/i, field: 'history', confidence: 0.8 },
  { deptPattern: /文学|语言|外语|翻译/i, field: 'linguistics', confidence: 0.75 },
  { deptPattern: /艺术|美术|音乐|设计|影视/i, field: 'arts', confidence: 0.8 },
  { deptPattern: /教育|师范/i, field: 'education', confidence: 0.75 },
  { deptPattern: /光学|光[电纤]|激光|光子/i, field: 'quantum-optics', confidence: 0.7 },
  { deptPattern: /机器人|无人[机驾驶]/i, field: 'artificial-intelligence', confidence: 0.7 },
  { deptPattern: /电气|电[力网]|能源互联网/i, field: 'electronic-engineering', confidence: 0.6 },
  { deptPattern: /系统安全/i, field: 'cybersecurity', confidence: 0.8 },
];

// ─── Inference Functions ───

/**
 * Infer field slugs from Chinese research topic text.
 * Returns deduped field slugs sorted by confidence.
 */
export function inferFieldsFromResearchText(text: string | null): string[] {
  if (!text || text.length < 3) return [];

  const matches = new Map<string, number>(); // field → max confidence

  for (const rule of RESEARCH_KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      const existing = matches.get(rule.field);
      if (!existing || existing < rule.confidence) {
        matches.set(rule.field, rule.confidence);
      }
    }
  }

  // Return up to 3 fields, sorted by confidence (highest first)
  return Array.from(matches.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([field]) => field);
}

/**
 * Infer field slugs from a department name.
 */
export function inferFieldsFromDepartment(department: string | null): string[] {
  if (!department || department.length < 2) return [];

  // Reject garbage "departments" that are actually career timelines, awards, etc.
  const garbageDeptPatterns = [
    /^\d{4}.*今/,                              // "2013~今，讲师、副教授、教授"
    /^\d{4}[-~年].*/,                           // "2013年-至今"
    /获奖|发明奖|专利奖|科技进步奖/,             // awards mistaken for department
  ];
  for (const pattern of garbageDeptPatterns) {
    if (pattern.test(department)) return [];
  }

  const matches: string[] = [];
  for (const { deptPattern, field, confidence } of DEPARTMENT_FIELD_MAP) {
    if (deptPattern.test(department)) {
      matches.push(field);
    }
  }
  // Dedup, return up to 2
  return [...new Set(matches)].slice(0, 2);
}

/**
 * Infer field slugs from URL patterns in the source URL or university key.
 * E.g., scraped from "cs.tsinghua.edu.cn" → computer-science
 */
export function inferFieldsFromSource(
  universityKey: string | null,
  sourceUrl: string | null,
): string[] {
  const matches: string[] = [];
  const urlLower = (sourceUrl || '').toLowerCase();

  if (urlLower) {
    // Subdomain patterns: cs.xxx.edu.cn, cse.xxx.edu.cn, ee.xxx.edu.cn, etc.
    const hostMatch = urlLower.match(/https?:\/\/([^\/]+)/);
    const host = hostMatch ? hostMatch[1] : '';
    const path = urlLower.replace(/https?:\/\/[^\/]+/, '');

    const urlForMatch = host + '/' + path;

    // Computer Science — common subdomain patterns
    if (/(?:^|[.\/])cs\b|computer|计算机|计科|cse\b|csee\b|css?e\b/i.test(urlForMatch)) {
      matches.push('computer-science');
    }
    // Electronic Engineering
    if (/(?:^|[.\/])ee\b|electronic|电子|电信|信息与通信|无线电/i.test(urlForMatch)) {
      matches.push('electronic-engineering');
    }
    // Mathematics
    if (/(?:^|[.\/])math\b|mathematics|数学|数理|统计/i.test(urlForMatch)) {
      matches.push('mathematics');
    }
    // Physics
    if (/(?:^|[.\/])physics?\b|物理|phys\b/i.test(urlForMatch)) {
      matches.push('physics');
    }
    // Chemistry
    if (/(?:^|[.\/])chem\b|化学|化工/i.test(urlForMatch)) {
      matches.push('chemistry');
    }
    // Biology
    if (/(?:^|[.\/])bio\b|生物|生命|life\b/i.test(urlForMatch)) {
      matches.push('biology');
    }
    // Medicine
    if (/(?:^|[.\/])med\b|医学|临床|药学|hospital/i.test(urlForMatch)) {
      matches.push('medicine');
    }
    // Economics
    if (/(?:^|[.\/])econom|经济|sem\b|经管|管理/i.test(urlForMatch)) {
      matches.push('economics');
    }
    // AI
    if (/(?:^|[.\/])ai\b|人工智能/.test(urlForMatch)) {
      matches.push('artificial-intelligence');
    }
    // Software
    if (/(?:^|[.\/])soft\b|软件|ss\b/i.test(urlForMatch)) {
      matches.push('computer-science');
    }
    // Statistics
    if (/(?:^|[.\/])stat\b|统计/i.test(urlForMatch)) {
      matches.push('probability');
    }
    // Security
    if (/(?:^|[.\/])security\b|安全|cyber|网安/i.test(urlForMatch)) {
      matches.push('cybersecurity');
    }
    // Automation
    if (/(?:^|[.\/])automation|自动化|auto\b/i.test(urlForMatch)) {
      matches.push('computer-science');
    }
    // Materials
    if (/material|材料|mse\b/i.test(urlForMatch)) {
      matches.push('chemistry');
    }
    // Generic informatics / information school → CS
    if (/informatics|信息(?!与通信|安全)|info\b/i.test(urlForMatch)) {
      matches.push('computer-science');
    }
    // Generic science → broad match, skip for now
  }

  return [...new Set(matches)].slice(0, 2);
}

/**
 * Infer field slugs from publication titles.
 */
export function inferFieldsFromPublications(
  publications: Array<{ title: string }>,
): string[] {
  if (!publications || publications.length === 0) return [];
  const text = publications.slice(0, 5).map((p) => p.title).join(' ');
  return inferFieldsFromResearchText(text);
}

/**
 * Combined field inference from all available scholar data.
 * Returns deduped field slugs with the most confident matches first.
 */
export function inferFields(args: {
  researchText?: string | null;
  department?: string | null;
  bio?: string | null;
  publications?: Array<{ title: string }>;
  institution?: string | null;
  universityKey?: string | null;
  sourceUrl?: string | null;
}): string[] {
  const allFields = new Map<string, number>();

  function add(matches: string[], conf: number) {
    for (const field of matches) {
      const existing = allFields.get(field);
      if (!existing || existing < conf) {
        allFields.set(field, conf);
      }
    }
  }

  // Research text is the strongest signal
  if (args.researchText && args.researchText.length > 3) {
    add(inferFieldsFromResearchText(args.researchText), 0.85);
  }

  // Publications provide moderate signal
  if (args.publications && args.publications.length > 0) {
    add(inferFieldsFromPublications(args.publications), 0.75);
  }

  // Department provides medium signal (with garbage filter)
  if (args.department && args.department.length > 2) {
    add(inferFieldsFromDepartment(args.department), 0.65);
  }

  // URL source provides signal for bare profiles
  if (args.sourceUrl) {
    add(inferFieldsFromSource(args.universityKey || null, args.sourceUrl), 0.55);
  }

  // Bio is the weakest text signal
  if (args.bio && args.bio.length > 10) {
    add(inferFieldsFromResearchText(args.bio), 0.5);
  }

  // Return up to 5 fields, highest confidence first
  return Array.from(allFields.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([field]) => field);
}

/**
 * Convert a scraped research topics string (comma/semicolon separated) into
 * a combined research text for inference.
 */
export function normalizeResearchText(
  researchUpdates: Array<{ title: string; description?: string | null }>,
): string {
  return researchUpdates
    .map((u) => `${u.title} ${u.description || ''}`)
    .join('; ');
}
