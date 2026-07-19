import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import os from "node:os";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const packagePath = path.join(root, "package.json");
const configuration = process.argv.includes("--debug") ? "debug" : "release";
const forwardedGradleArgs = process.argv.slice(2).filter((argument) => argument !== "--debug");
const gradleTask = configuration === "debug" ? "assembleDebug" : "assembleRelease";
const gradleWrapper = path.join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
const gradleWrapperJar = path.join(androidDir, "gradle", "wrapper", "gradle-wrapper.jar");
const javaCommand = process.env.JAVA_HOME
  ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java")
  : "java";
const capacitorCli = path.join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor");
const requiredCordovaVariables = path.join(
  androidDir,
  "capacitor-cordova-android-plugins",
  "cordova.variables.gradle"
);
const outputApk = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  configuration,
  configuration === "debug" ? "app-debug.apk" : "app-release.apk"
);
const buildEnvironment = { ...process.env };

function resolveAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    path.join(os.homedir(), "AppData", "Local", "Android", "Sdk"),
    path.join(os.homedir(), "Android", "Sdk"),
    path.join(os.homedir(), "Library", "Android", "sdk")
  ].filter(Boolean);

  return candidates.find((candidate) =>
    existsSync(path.join(candidate, "platforms")) &&
    existsSync(path.join(candidate, "build-tools"))
  );
}

function assertProjectRoot() {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));

  if (packageJson.name !== "ai-knowledge-base-app" || !existsSync(androidDir)) {
    throw new Error(`Refusing to build outside the expected project root: ${root}`);
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    env: buildEnvironment,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? "unknown"}): ${path.basename(command)}`);
  }
}

assertProjectRoot();

const androidSdk = resolveAndroidSdk();
if (!androidSdk) {
  throw new Error("Android SDK was not found. Set ANDROID_HOME or install it in the standard user SDK directory.");
}
buildEnvironment.ANDROID_HOME = androidSdk;
buildEnvironment.ANDROID_SDK_ROOT = androidSdk;

if (!existsSync(capacitorCli)) {
  throw new Error("Capacitor CLI is missing. Run pnpm install --frozen-lockfile before building the APK.");
}

if (!existsSync(gradleWrapper)) {
  throw new Error(`Android Gradle wrapper was not found: ${gradleWrapper}`);
}

if (!existsSync(gradleWrapperJar)) {
  throw new Error(`Android Gradle wrapper JAR was not found: ${gradleWrapperJar}`);
}

run(process.execPath, [capacitorCli, "sync", "android"], root);

if (!existsSync(requiredCordovaVariables)) {
  throw new Error(`Capacitor sync did not generate the required file: ${requiredCordovaVariables}`);
}

if (process.platform !== "win32") {
  chmodSync(gradleWrapper, 0o755);
}

run(javaCommand, [
  "-Dorg.gradle.appname=gradlew",
  "-classpath",
  gradleWrapperJar,
  "org.gradle.wrapper.GradleWrapperMain",
  gradleTask,
  ...forwardedGradleArgs
], androidDir);

if (!existsSync(outputApk) || statSync(outputApk).size <= 0) {
  throw new Error(`Android ${configuration} APK was not generated: ${outputApk}`);
}

process.stdout.write(`Android ${configuration} APK generated: ${outputApk}\n`);
