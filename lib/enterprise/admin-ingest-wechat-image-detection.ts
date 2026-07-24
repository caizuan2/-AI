import type { Metadata } from "sharp";

const WECHAT_LONG_IMAGE_MIN_HEIGHT = 3_000;
const WECHAT_LONG_IMAGE_MIN_ASPECT_RATIO = 3;
const WECHAT_LONG_IMAGE_MIN_WIDTH = 320;
const WECHAT_LONG_IMAGE_MAX_WIDTH = 1_800;
const WECHAT_GREEN_MIN_RATIO = 0.008;
const WECHAT_LIGHT_BACKGROUND_MIN_RATIO = 0.45;
const WECHAT_DETECTION_SAMPLE_WIDTH = 160;
const WECHAT_DETECTION_MAX_PIXELS = 60_000_000;

export interface AdminIngestWechatImageDetection {
  detected: boolean;
  width: number;
  height: number;
  aspectRatio: number;
  greenRatio: number;
  lightBackgroundRatio: number;
}

function orientedImageDimensions(metadata: Metadata) {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const swapsAxes = metadata.orientation !== undefined
    && metadata.orientation >= 5
    && metadata.orientation <= 8;

  return swapsAxes
    ? { width: height, height: width }
    : { width, height };
}

function isWechatGreenPixel(red: number, green: number, blue: number) {
  return green >= 150
    && red >= 50
    && red <= 205
    && blue <= 180
    && green - red >= 30
    && green - blue >= 25;
}

function isLightBackgroundPixel(red: number, green: number, blue: number) {
  return red >= 215 && green >= 215 && blue >= 215;
}

function emptyDetection(): AdminIngestWechatImageDetection {
  return {
    detected: false,
    width: 0,
    height: 0,
    aspectRatio: 0,
    greenRatio: 0,
    lightBackgroundRatio: 0
  };
}

export async function detectAdminIngestWechatConversationImage(
  bytes: Uint8Array
): Promise<AdminIngestWechatImageDetection> {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const image = sharp(Buffer.from(bytes), {
      limitInputPixels: WECHAT_DETECTION_MAX_PIXELS
    }).rotate();
    const metadata = await image.metadata();
    const { width, height } = orientedImageDimensions(metadata);
    const aspectRatio = width > 0 ? height / width : 0;
    const isLongPhoneScreenshot = width >= WECHAT_LONG_IMAGE_MIN_WIDTH
      && width <= WECHAT_LONG_IMAGE_MAX_WIDTH
      && height >= WECHAT_LONG_IMAGE_MIN_HEIGHT
      && aspectRatio >= WECHAT_LONG_IMAGE_MIN_ASPECT_RATIO;

    if (!isLongPhoneScreenshot) {
      return {
        ...emptyDetection(),
        width,
        height,
        aspectRatio
      };
    }

    const sample = await image
      .clone()
      .resize({
        width: WECHAT_DETECTION_SAMPLE_WIDTH,
        withoutEnlargement: true
      })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = Math.max(3, sample.info.channels);
    const pixelCount = Math.floor(sample.data.length / channels);
    let greenPixels = 0;
    let lightBackgroundPixels = 0;

    for (let index = 0; index + 2 < sample.data.length; index += channels) {
      const red = sample.data[index];
      const green = sample.data[index + 1];
      const blue = sample.data[index + 2];

      if (isWechatGreenPixel(red, green, blue)) {
        greenPixels += 1;
      }

      if (isLightBackgroundPixel(red, green, blue)) {
        lightBackgroundPixels += 1;
      }
    }

    const greenRatio = pixelCount > 0 ? greenPixels / pixelCount : 0;
    const lightBackgroundRatio = pixelCount > 0 ? lightBackgroundPixels / pixelCount : 0;

    return {
      detected: greenRatio >= WECHAT_GREEN_MIN_RATIO
        && lightBackgroundRatio >= WECHAT_LIGHT_BACKGROUND_MIN_RATIO,
      width,
      height,
      aspectRatio,
      greenRatio,
      lightBackgroundRatio
    };
  } catch {
    return emptyDetection();
  }
}
