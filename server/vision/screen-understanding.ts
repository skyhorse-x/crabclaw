/**
 * MiniMonkey 屏幕理解模块实现
 * @description 集成 YOLOv8 + PaddleOCR，实现 UI 元素检测、文字识别和语义理解
 */

// ==================== 类型定义 ====================

/**
 * UI 元素类型
 */
export enum UIElementType {
  BUTTON = 'button',
  INPUT = 'input',
  LINK = 'link',
  ICON = 'icon',
  TEXT = 'text',
  IMAGE = 'image',
  DROPDOWN = 'dropdown',
  CHECKBOX = 'checkbox',
  RADIO = 'radio',
  TABLE = 'table',
  UNKNOWN = 'unknown'
}

/**
 * UI 元素定义
 */
export interface UIElement {
  id: string
  type: UIElementType
  boundingBox: BoundingBox
  confidence: number
  text?: string
  icon?: string
  attributes?: Record<string, any>
  actions?: string[] // 可执行的动作
}

/**
 * 边界框
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 文字区域
 */
export interface TextRegion {
  text: string
  confidence: number
  boundingBox: BoundingBox
  language?: string
}

// ==================== UI 元素检测器 ====================

/**
 * 屏幕元素检测器（基于 YOLOv8）
 */
export class ScreenElementDetector {
  private model: DetectionModel | null = null
  private initialized = false
  
  /**
   * 初始化模型
   */
  async initialize(modelPath?: string): Promise<void> {
    if (this.initialized) return
    
    try {
      // 加载 YOLOv8 模型
      this.model = await this.loadYOLOModel(modelPath || 'models/yolov8-ui.onnx')
      this.initialized = true
      
      console.log('[ScreenElementDetector] 模型加载成功')
    } catch (error) {
      console.error('[ScreenElementDetector] 模型加载失败:', error)
      throw error
    }
  }
  
  /**
   * 检测 UI 元素
   */
  async detectElements(screenshot: ImageSource): Promise<UIElement[]> {
    if (!this.initialized) {
      throw new Error('检测器未初始化')
    }
    
    try {
      // 1. 预处理图像
      const processedImage = await this.preprocess(screenshot)
      
      // 2. 模型推理
      const detections = await this.model!.detect(processedImage)
      
      // 3. 后处理
      const elements = await this.postprocess(detections, screenshot)
      
      return elements
    } catch (error) {
      console.error('[ScreenElementDetector] 检测失败:', error)
      throw error
    }
  }
  
  /**
   * 加载 YOLO 模型
   */
  private async loadYOLOModel(modelPath: string): Promise<DetectionModel> {
    // 使用 ONNX Runtime 加载模型
    const ort = await import('onnxruntime-node')
    const session = await ort.InferenceSession.create(modelPath)
    
    return {
      detect: async (image: Tensor) => {
        const inputTensor = new ort.Tensor('float32', image.data, [1, 3, 640, 640])
        const results = await session.run({ images: inputTensor })
        
        // 解析检测结果
        return this.parseDetections(results.output.data)
      }
    }
  }
  
  /**
   * 图像预处理
   */
  private async preprocess(screenshot: ImageSource): Promise<Tensor> {
    // 1. 转换为 RGB
    const rgb = await this.convertToRGB(screenshot)
    
    // 2. 缩放到 640x640
    const resized = await this.resize(rgb, 640, 640)
    
    // 3. 归一化到 [0, 1]
    const normalized = this.normalize(resized)
    
    // 4. 转换为 Tensor
    return new Tensor('float32', normalized, [3, 640, 640])
  }
  
  /**
   * 解析检测结果
   */
  private parseDetections(outputData: Float32Array): Detection[] {
    const detections: Detection[] = []
    const confidenceThreshold = 0.5
    const iouThreshold = 0.45
    
    // 解析 YOLO 输出格式
    for (let i = 0; i < outputData.length; i += 85) {
      const confidence = outputData[i + 4]
      
      if (confidence > confidenceThreshold) {
        const classId = this.argmax(outputData.slice(i + 5, i + 85))
        const score = outputData[i + 5 + classId]
        
        if (score > confidenceThreshold) {
          const bbox = {
            x: outputData[i],
            y: outputData[i + 1],
            width: outputData[i + 2],
            height: outputData[i + 3]
          }
          
          detections.push({
            classId,
            className: this.getUIClassName(classId),
            bbox,
            confidence: score
          })
        }
      }
    }
    
    // 应用 NMS（非极大值抑制）
    return this.applyNMS(detections, iouThreshold)
  }
  
  /**
   * 后处理：转换为 UIElement
   */
  private async postprocess(detections: Detection[], screenshot: ImageSource): Promise<UIElement[]> {
    const elements: UIElement[] = []
    
    for (const detection of detections) {
      // 1. 坐标转换回原图尺寸
      const originalBbox = this.scaleBoundingBox(detection.bbox, screenshot.width, screenshot.height)
      
      // 2. OCR 识别文字
      const text = await this.extractText(screenshot, originalBbox)
      
      // 3. 推断可操作性
      const actions = this.inferAffordance(detection.className, text)
      
      elements.push({
        id: uuid(),
        type: this.mapToUIType(detection.className),
        boundingBox: originalBbox,
        confidence: detection.confidence,
        text,
        actions
      })
    }
    
    return elements
  }
  
  /**
   * 提取区域内的文字
   */
  private async extractText(screenshot: ImageSource, bbox: BoundingBox): Promise<string> {
    const ocr = new ScreenOCR()
    const cropped = await this.cropImage(screenshot, bbox)
    const regions = await ocr.recognizeText(cropped)
    
    return regions.map(r => r.text).join(' ')
  }
  
  /**
   * 推断可操作性
   */
  private inferAffordance(elementType: string, text?: string): string[] {
    const mapping: Record<string, string[]> = {
      'button': ['click', 'doubleClick'],
      'input': ['type', 'paste', 'clear', 'focus'],
      'link': ['click', 'copyLink', 'openInNewTab'],
      'icon': ['click'],
      'text': ['select', 'copy'],
      'image': ['click', 'saveAs'],
      'dropdown': ['click', 'select'],
      'checkbox': ['click', 'toggle'],
      'radio': ['click', 'select']
    }
    
    const baseActions = mapping[elementType] || []
    
    // 根据文字增强推断
    if (text) {
      if (text.toLowerCase().includes('submit')) {
        baseActions.push('submit')
      }
      if (text.toLowerCase().includes('delete')) {
        baseActions.push('confirm')
      }
    }
    
    return baseActions
  }
  
  // === 辅助方法 ===
  
  private getUIClassName(classId: number): string {
    const classes = [
      'button', 'input', 'link', 'icon', 'text',
      'image', 'dropdown', 'checkbox', 'radio', 'table'
    ]
    return classes[classId] || 'unknown'
  }
  
  private mapToUIType(className: string): UIElementType {
    const mapping: Record<string, UIElementType> = {
      'button': UIElementType.BUTTON,
      'input': UIElementType.INPUT,
      'link': UIElementType.LINK,
      'icon': UIElementType.ICON,
      'text': UIElementType.TEXT,
      'image': UIElementType.IMAGE,
      'dropdown': UIElementType.DROPDOWN,
      'checkbox': UIElementType.CHECKBOX,
      'radio': UIElementType.RADIO,
      'table': UIElementType.TABLE
    }
    return mapping[className] || UIElementType.UNKNOWN
  }
  
  private argmax(array: Float32Array): number {
    let maxIndex = 0
    let maxValue = array[0]
    
    for (let i = 1; i < array.length; i++) {
      if (array[i] > maxValue) {
        maxValue = array[i]
        maxIndex = i
      }
    }
    
    return maxIndex
  }
  
  private applyNMS(detections: Detection[], iouThreshold: number): Detection[] {
    // 按置信度排序
    detections.sort((a, b) => b.confidence - a.confidence)
    
    const selected: Detection[] = []
    
    while (detections.length > 0) {
      const current = detections.shift()!
      selected.push(current)
      
      // 移除 IoU 过高的检测
      detections = detections.filter(d => {
        const iou = this.calculateIoU(current.bbox, d.bbox)
        return iou < iouThreshold
      })
    }
    
    return selected
  }
  
  private calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    const intersection = this.calculateIntersection(box1, box2)
    const area1 = box1.width * box1.height
    const area2 = box2.width * box2.height
    const union = area1 + area2 - intersection
    
    return intersection / union
  }
  
  private calculateIntersection(box1: BoundingBox, box2: BoundingBox): number {
    const x1 = Math.max(box1.x, box2.x)
    const y1 = Math.max(box1.y, box2.y)
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width)
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height)
    
    if (x2 <= x1 || y2 <= y1) return 0
    
    return (x2 - x1) * (y2 - y1)
  }
  
  // 其他图像处理方法省略...
}

// ==================== OCR 文字识别 ====================

/**
 * 屏幕 OCR 识别器（基于 PaddleOCR）
 */
export class ScreenOCR {
  private engine: IOCREngine | null = null
  private initialized = false
  
  /**
   * 初始化 OCR 引擎
   */
  async initialize(enginePath?: string): Promise<void> {
    if (this.initialized) return
    
    try {
      // 加载 PaddleOCR
      this.engine = await this.loadPaddleOCR(enginePath)
      this.initialized = true
      
      console.log('[ScreenOCR] 引擎加载成功')
    } catch (error) {
      console.error('[ScreenOCR] 引擎加载失败:', error)
      throw error
    }
  }
  
  /**
   * 识别文字
   */
  async recognizeText(image: ImageSource, region?: BoundingBox): Promise<TextRegion[]> {
    if (!this.initialized) {
      throw new Error('OCR 引擎未初始化')
    }
    
    try {
      // 1. 裁剪区域（如果指定）
      const cropped = region ? await this.cropImage(image, region) : image
      
      // 2. OCR 识别
      const results = await this.engine!.recognize(cropped)
      
      // 3. 转换为 TextRegion
      return results.map(r => ({
        text: r.text,
        confidence: r.confidence,
        boundingBox: r.bbox,
        language: r.language || 'zh'
      }))
    } catch (error) {
      console.error('[ScreenOCR] 识别失败:', error)
      throw error
    }
  }
  
  /**
   * 提取结构化文本
   */
  async extractStructuredText(image: ImageSource): Promise<StructuredText> {
    // 1. 基础 OCR
    const regions = await this.recognizeText(image)
    
    // 2. NLP 处理
    const entities = await this.extractEntities(regions)
    const relations = await this.extractRelations(regions)
    
    // 3. 摘要生成
    const summary = await this.summarize(regions)
    
    return {
      raw: regions,
      entities,
      relations,
      summary
    }
  }
  
  /**
   * 加载 PaddleOCR
   */
  private async loadPaddleOCR(enginePath: string): Promise<IOCREngine> {
    // 使用 paddlejs-node
    const paddle = await import('paddlejs-node')
    
    return {
      recognize: async (image: ImageSource) => {
        // PaddleOCR 推理
        const results = await paddle.ocr.detect(image.data)
        return results
      }
    }
  }
  
  /**
   * 提取实体
   */
  private async extractEntities(regions: TextRegion[]): Promise<Entity[]> {
    // 使用 NLP 库提取命名实体
    const nlp = await import('natural')
    const entities: Entity[] = []
    
    for (const region of regions) {
      const tokens = nlp.WordTokenizer().tokenize(region.text)
      const ner = new nlp.NamedEntityRecognition()
      
      const tags = ner.tag(tokens)
      entities.push(...tags
        .filter((t: any) => t.entity)
        .map((t: any) => ({
          text: t.token,
          type: t.entity,
          source: region
        })))
    }
    
    return entities
  }
  
  /**
   * 提取关系
   */
  private async extractRelations(regions: TextRegion[]): Promise<Relation[]> {
    // 简单的关系抽取（共现分析）
    const relations: Relation[] = []
    
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        if (this.areAdjacent(regions[i].boundingBox, regions[j].boundingBox)) {
          relations.push({
            source: regions[i],
            target: regions[j],
            type: 'adjacent'
          })
        }
      }
    }
    
    return relations
  }
  
  /**
   * 生成摘要
   */
  private async summarize(regions: TextRegion[]): Promise<string> {
    const texts = regions.map(r => r.text).join(' ')
    
    // 简单的提取关键句
    const sentences = texts.split(/[.!?.]/)
    return sentences.slice(0, 3).join('. ')
  }
  
  private areAdjacent(box1: BoundingBox, box2: BoundingBox): boolean {
    const distance = Math.sqrt(
      Math.pow(box1.x - box2.x, 2) + Math.pow(box1.y - box2.y, 2)
    )
    return distance < 100 // 100 像素以内算相邻
  }
}

// ==================== 界面语义理解 ====================

/**
 * 界面语义理解器
 */
export class UISemanticUnderstanding {
  private llm: ILLMService
  
  constructor(llm: ILLMService) {
    this.llm = llm
  }
  
  /**
   * 生成界面描述
   */
  async generateDescription(elements: UIElement[]): Promise<string> {
    const elementDescriptions = elements.map(e => 
      `- ${e.type}: ${e.text || '无文字'} (位置：${e.boundingBox.x},${e.boundingBox.y})`
    ).join('\n')
    
    const prompt = `
      分析这个界面包含的元素：
      ${elementDescriptions}
      
      请描述:
      1. 这是什么类型的界面？（登录页、表单、列表等）
      2. 主要功能是什么？
      3. 用户可以执行哪些操作？
      4. 界面布局如何？
    `
    
    const description = await this.llm.generate(prompt)
    return description.content
  }
  
  /**
   * 推断可操作性（Affordance）
   */
  async inferAffordance(element: UIElement): Promise<string[]> {
    const possibleActions: string[] = []
    
    switch (element.type) {
      case UIElementType.BUTTON:
        possibleActions.push('click', 'doubleClick')
        if (element.text?.toLowerCase().includes('submit')) {
          possibleActions.push('submit')
        }
        break
        
      case UIElementType.INPUT:
        possibleActions.push('type', 'paste', 'clear', 'focus')
        break
        
      case UIElementType.LINK:
        possibleActions.push('click', 'copyLink', 'openInNewTab')
        break
        
      case UIElementType.TEXT:
        possibleActions.push('select', 'copy')
        break
        
      case UIElementType.IMAGE:
        possibleActions.push('click', 'saveAs')
        break
    }
    
    return possibleActions
  }
  
  /**
   * 理解界面意图
   */
  async understandIntent(elements: UIElement[], goal?: string): Promise<Intent> {
    const prompt = `
      界面元素：
      ${elements.map(e => `${e.type}: ${e.text}`).join(', ')}
      
      用户目标：${goal || '未知'}
      
      请推断：
      1. 用户可能的意图是什么？
      2. 下一步最可能的操作是什么？
      3. 需要哪些信息才能完成任务？
    `
    
    const intent = await this.llm.generate(prompt)
    
    return {
      type: this.parseIntentType(intent.content),
      confidence: 0.8,
      nextAction: intent.nextAction,
      requiredInfo: intent.requiredInfo
    }
  }
  
  private parseIntentType(text: string): IntentType {
    if (text.includes('登录')) return 'login'
    if (text.includes('搜索')) return 'search'
    if (text.includes('提交')) return 'submit'
    if (text.includes('导航')) return 'navigate'
    return 'general'
  }
}
