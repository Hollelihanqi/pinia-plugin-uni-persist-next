#!/usr/bin/env node

/**
 * 安全发布脚本：先发布 npm，成功后再提交 git
 * 流程：build → 更新版本号 → 发布 npm → git 提交 → 生成日志
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function exec(cmd, errorMsg, silent = false) {
  try {
    if (!silent) {
      console.log(`\n🔄 执行: ${cmd}`);
    }
    execSync(cmd, { stdio: silent ? 'pipe' : 'inherit' });
    return true;
  } catch (error) {
    console.error(`\n❌ ${errorMsg}`);
    if (error.stderr) {
      console.error(error.stderr.toString());
    }
    return false;
  }
}

function readPackageJson() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
}

function writePackageJson(pkg) {
  const pkgPath = path.join(process.cwd(), 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log('🚀 开始安全发布流程...\n');

  // 1. 读取当前版本
  const pkg = readPackageJson();
  const currentVersion = pkg.version;
  console.log(`📌 当前版本: ${currentVersion}`);

  // 2. 选择新版本
  const versionParts = currentVersion.split('.').map(Number);
  const suggestions = {
    patch: `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`,
    minor: `${versionParts[0]}.${versionParts[1] + 1}.0`,
    major: `${versionParts[0] + 1}.0.0`,
  };

  console.log('\n选择新版本:');
  console.log(`  1) patch: ${suggestions.patch}`);
  console.log(`  2) minor: ${suggestions.minor}`);
  console.log(`  3) major: ${suggestions.major}`);
  console.log(`  4) 自定义版本号`);

  const choice = await question('\n请选择 (1-4): ');
  let newVersion;

  switch (choice.trim()) {
    case '1':
      newVersion = suggestions.patch;
      break;
    case '2':
      newVersion = suggestions.minor;
      break;
    case '3':
      newVersion = suggestions.major;
      break;
    case '4':
      newVersion = await question('请输入自定义版本号: ');
      break;
    default:
      console.error('❌ 无效选择');
      process.exit(1);
  }

  // 3. 更新 package.json
  console.log(`\n✏️  步骤 1: 更新版本号 ${currentVersion} → ${newVersion}`);
  pkg.version = newVersion;
  writePackageJson(pkg);

  // 4. 发布到 npm (会自动触发 prepublishOnly 钩子进行构建)
  console.log('\n📤 步骤 2: 发布到 npm (自动构建中...)');
  const publishSuccess = exec('pnpm publish --no-git-checks', '发布失败，回退版本号', false);

  if (!publishSuccess) {
    // 回退版本号
    console.log('\n⏮️  正在回退版本号...');
    pkg.version = currentVersion;
    writePackageJson(pkg);
    console.log('✅ 版本号已成功回退到 ' + currentVersion);
    console.log('\n❌ 发布流程已中止（这是预期行为，非异常）');
    console.log('   原因：npm 发布失败');
    console.log('   建议：检查 npm 登录状态或版本冲突\n');
    process.exit(1);
  }

  console.log('✅ 发布成功！');

  // 5. 生成 CHANGELOG
  console.log('\n📝 步骤 3: 生成 CHANGELOG');
  exec('npx conventional-changelog -p angular -i CHANGELOG.md -s', 'CHANGELOG 生成失败（可忽略）');

  // 6. Git 提交
  console.log('\n📌 步骤 4: 提交到 Git');
  exec('git add .', 'Git add 失败');
  exec(`git commit -m "chore: release v${newVersion}"`, 'Git commit 失败');
  
  const shouldPush = await question('\n是否推送到远程仓库? (y/n): ');
  if (shouldPush.toLowerCase() === 'y') {
    exec('git push', 'Git push 失败');
  }

  console.log('\n🎉 发布流程完成！');
  console.log(`   版本: ${currentVersion} → ${newVersion}`);
  console.log(`   npm: https://www.npmjs.com/package/${pkg.name}`);
  
  rl.close();
}

main().catch(error => {
  console.error('\n❌ 发布失败:', error);
  process.exit(1);
});
