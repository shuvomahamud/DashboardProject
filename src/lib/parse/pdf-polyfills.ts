/**
 * Browser API polyfills for pdfjs-dist in Node.js environment
 * MUST be imported before pdfjs-dist
 */

// Only polyfill in Node.js/serverless environment
if (typeof window === 'undefined') {
  // @ts-ignore - DOMMatrix polyfill
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      a: number; b: number; c: number; d: number; e: number; f: number;
      m11: number; m12: number; m13: number; m14: number;
      m21: number; m22: number; m23: number; m24: number;
      m31: number; m32: number; m33: number; m34: number;
      m41: number; m42: number; m43: number; m44: number;
      is2D: boolean;
      isIdentity: boolean;

      constructor(init?: any) {
        this.a = this.m11 = 1;
        this.b = this.m12 = 0;
        this.c = this.m21 = 0;
        this.d = this.m22 = 1;
        this.e = this.m41 = 0;
        this.f = this.m42 = 0;
        this.m13 = this.m14 = 0;
        this.m23 = this.m24 = 0;
        this.m31 = this.m32 = 0;
        this.m33 = 1;
        this.m34 = this.m43 = this.m44 = 0;
        this.is2D = true;
        this.isIdentity = true;
      }

      translate(tx: number, ty: number) { return this; }
      scale(sx: number, sy?: number) { return this; }
      rotate(angle: number) { return this; }
      multiply(other: any) { return this; }
      inverse() { return this; }
      transformPoint(point: any) { return point; }
      toString() { return 'matrix(1, 0, 0, 1, 0, 0)'; }
    } as any;
  }

  // @ts-ignore - Path2D polyfill
  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {
      constructor(path?: any) {}
      addPath(path: any) {}
      closePath() {}
      moveTo(x: number, y: number) {}
      lineTo(x: number, y: number) {}
      bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {}
      quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {}
      arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {}
      arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {}
      ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {}
      rect(x: number, y: number, w: number, h: number) {}
    } as any;
  }

  // @ts-ignore - ImageData polyfill
  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      colorSpace: 'srgb' | 'display-p3';

      constructor(width: number, height: number);
      constructor(data: Uint8ClampedArray, width: number, height?: number);
      constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
        if (dataOrWidth instanceof Uint8ClampedArray) {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height = height || Math.floor(dataOrWidth.length / 4 / widthOrHeight);
        } else {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(dataOrWidth * widthOrHeight * 4);
        }
        this.colorSpace = 'srgb';
      }
    } as any;
  }

  // @ts-ignore - OffscreenCanvas polyfill (minimal)
  if (!globalThis.OffscreenCanvas) {
    globalThis.OffscreenCanvas = class OffscreenCanvas {
      width: number;
      height: number;

      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }

      getContext(contextId: string, options?: any) {
        // Return minimal 2d context
        return {
          canvas: this,
          fillStyle: '#000',
          strokeStyle: '#000',
          lineWidth: 1,
          lineCap: 'butt',
          lineJoin: 'miter',
          miterLimit: 10,
          font: '10px sans-serif',
          textAlign: 'start',
          textBaseline: 'alphabetic',
          globalAlpha: 1,
          globalCompositeOperation: 'source-over',
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'low',
          save() {},
          restore() {},
          scale(x: number, y: number) {},
          rotate(angle: number) {},
          translate(x: number, y: number) {},
          transform(a: number, b: number, c: number, d: number, e: number, f: number) {},
          setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {},
          resetTransform() {},
          createLinearGradient(x0: number, y0: number, x1: number, y1: number) { return {}; },
          createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) { return {}; },
          createPattern(image: any, repetition: string) { return {}; },
          clearRect(x: number, y: number, w: number, h: number) {},
          fillRect(x: number, y: number, w: number, h: number) {},
          strokeRect(x: number, y: number, w: number, h: number) {},
          fillText(text: string, x: number, y: number, maxWidth?: number) {},
          strokeText(text: string, x: number, y: number, maxWidth?: number) {},
          measureText(text: string) { return { width: text.length * 8 }; },
          drawImage(...args: any[]) {},
          createImageData(width: number, height: number) {
            return new globalThis.ImageData(width, height);
          },
          getImageData(sx: number, sy: number, sw: number, sh: number) {
            return new globalThis.ImageData(sw, sh);
          },
          putImageData(imageData: any, dx: number, dy: number) {},
          beginPath() {},
          closePath() {},
          moveTo(x: number, y: number) {},
          lineTo(x: number, y: number) {},
          bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {},
          quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {},
          arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {},
          arcTo(x1: number, y1: number, x2: number, y2: number, radius: number) {},
          ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean) {},
          rect(x: number, y: number, w: number, h: number) {},
          fill() {},
          stroke() {},
          clip() {},
          isPointInPath(x: number, y: number) { return false; },
          isPointInStroke(x: number, y: number) { return false; }
        };
      }

      convertToBlob(options?: any) {
        return Promise.resolve(new Blob());
      }

      transferToImageBitmap() {
        return {};
      }
    } as any;
  }

  console.log('✓ PDF polyfills loaded for Node.js environment');
}
