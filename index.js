#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import cliProgress from 'cli-progress';
import { list as getDrives } from 'drivelist';

// Fungsi untuk menampilkan menu interaktif
async function showInteractiveMenu({ options, title }) {
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: title,
      choices: options,
    },
  ]);
  return options.indexOf(choice);
}

// Fungsi untuk mendapatkan input dari user (pengganti Read-Host)
async function pressAnyKey() {
  console.log(chalk.cyan('Tekan tombol apa saja untuk memulai...'));
  process.stdin.setRawMode(true);
  return new Promise(resolve => process.stdin.once('data', () => {
    process.stdin.setRawMode(false);
    resolve();
  }));
}

// Fungsi rekursif untuk mencari folder
async function findFolders(dir, foldersToFind, found = []) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (foldersToFind.includes(entry.name)) {
          found.push(fullPath);
        } else {
          // Hindari pemindaian rekursif ke dalam folder yang sudah ditemukan
          // seperti vendor di dalam node_modules
          if (!foldersToFind.some(f => fullPath.includes(path.sep + f + path.sep))) {
            await findFolders(fullPath, foldersToFind, found);
          }
        }
      }
    }
  } catch (error) {
    // Abaikan error permission denied, sama seperti -ErrorAction SilentlyContinue
  }
  return found;
}

function showDonationMessage() {
  console.log();
  console.log(chalk.yellow('====================================================='));
  console.log(chalk.white('      Terima kasih telah menggunakan rnv-cleaner!      '));
  console.log(chalk.yellow('====================================================='));
  console.log(chalk.white('\nJika tool ini membantumu, pertimbangkan untuk mendukung pengembang'));
  console.log(chalk.white('dengan donasi kecil. Dukunganmu sangat berarti! 🙏\n'));

  console.log(chalk.cyanBright(`Saweria   : https://saweria.co/alxdyy`));
  console.log(chalk.greenBright(`Trakteer  : https://trakteer.id/alxdyy`));
  // console.log(chalk.magentaBright(`Ko-fi     : https://ko-fi.com/alxdyy`));
  console.log();
}

// --- LOGIKA UTAMA SKRIP ---
async function main() {
  const originalTitle = 'Terminal'; // Judul default, bisa disesuaikan
  // Mengatur judul window (cross-platform-ish)
  const setWindowTitle = (title) => process.stdout.write(`\x1b]2;${title}\x07`);

  try {
    // 1. TAMPILKAN INFORMASI AWAL
    console.clear();
    console.log(chalk.green('====================================================='));
    console.log(chalk.green('           Pembersih Folder Proyek (rnv)             '));
    console.log(chalk.green('====================================================='));
    console.log(chalk.white('\nSkrip ini membantumu membersihkan folder-folder yang boros tempat seperti:'));
    console.log(chalk.yellow('  - node_modules (Folder dependensi JavaScript)'));
    console.log(chalk.yellow('  - vendor (Folder dependensi PHP/Composer)'));
    console.log(chalk.yellow('  - .git (Folder repositori Git)'));
    console.log();
    console.log(chalk.white('Folder-folder ini biasanya aman untuk dihapus karena dapat'));
    console.log(chalk.white("dibuat kembali dengan perintah seperti 'npm install','composer install' atau 'git init'."));
    console.log();
    console.log(chalk.red('PERHATIAN:'));
    console.log(chalk.red('Proses penghapusan ini bersifat PERMANEN. Pastikan Anda tidak'));
    console.log(chalk.red('menyimpan file penting di dalam folder-folder tersebut.'));
    console.log();

    await pressAnyKey();
    console.clear();

    // 2. PEMILIHAN DRIVE
    const drives = await getDrives();
    const driveOptions = drives.map(d => `Drive ${d.mountpoints[0].path}`);

    // Tambahkan opsi untuk input manual
    const manualInputOption = "Masukkan path secara manual...";
    driveOptions.push(manualInputOption);

    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'Pilih drive yang ingin Anda pindai:',
        choices: driveOptions,
      },
    ]);

    let targetPath;
    if (choice === manualInputOption) {
      const { manualPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'manualPath',
          message: 'Masukkan path lengkap (contoh: D:\\ atau D:\\folder\\projek):',
          // Validasi sederhana untuk memastikan path diisi
          validate: function (value) {
            if (value.length) {
              return true;
            } else {
              return 'Path tidak boleh kosong.';
            }
          }
        }
      ]);
      targetPath = manualPath;
    } else {
      // Logika lama untuk mendapatkan path dari pilihan
      const driveIndex = driveOptions.indexOf(choice);
      targetPath = drives[driveIndex].mountpoints[0].path;
    }

    console.clear();

    // 3. PEMILIHAN TARGET FOLDER
    const folderOptions = [
      "Hanya 'node_modules'",
      "Hanya 'vendor'",
      "Hanya '.git'",
      "'node_modules' & 'vendor'",
      "'node_modules' & '.git'",
      "'vendor' & '.git'",
      "SEMUA ('node_modules', 'vendor', '.git')",
    ];
    const choiceIndex = await showInteractiveMenu({ options: folderOptions, title: 'Pilih folder yang ingin dicari dan dihapus:' });

    let foldersToFind = [];
    switch (choiceIndex) {
      case 0: foldersToFind = ['node_modules']; break;
      case 1: foldersToFind = ['vendor']; break;
      case 2: foldersToFind = ['.git']; break;
      case 3: foldersToFind = ['node_modules', 'vendor']; break;
      case 4: foldersToFind = ['node_modules', '.git']; break;
      case 5: foldersToFind = ['vendor', '.git']; break;
      case 6: foldersToFind = ['node_modules', 'vendor', '.git']; break;
    }
    console.clear();
    console.log(chalk.green(`\nDrive yang dipilih: ${targetPath}`));
    console.log(chalk.green(`Target pencarian: ${foldersToFind.join(', ')}`));

    // 4. PROSES PENCARIAN DENGAN SPINNER (ORA)
    console.log(chalk.yellow(`\nMemulai pencarian di '${targetPath}'...`));
    setWindowTitle(`Memindai Drive '${targetPath}'...`);
    const spinner = ora('Memindai...').start();
    const foundItems = await findFolders(targetPath, foldersToFind);
    spinner.succeed(chalk.green('Pencarian Selesai!'));

    if (foundItems.length === 0) {
      console.log(chalk.green(`\nTidak ada folder (${foldersToFind.join(', ')}) yang ditemukan di ${targetPath}`));
      return;
    }

    // 5. LOGIKA PEMFILTERAN
    setWindowTitle(`Memfilter ${foundItems.length} Hasil Temuan...`);
    const sortedItems = foundItems.sort((a, b) => a.length - b.length);
    const itemsToRemove = [];
    const filterBar = new cliProgress.SingleBar({
      format: `Memfilter Hasil Temuan |${chalk.cyan('{bar}')}| {percentage}% || {value}/{total} Item`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    });
    filterBar.start(sortedItems.length, 0);

    for (const item of sortedItems) {
      let isNested = false;
      for (const existingItem of itemsToRemove) {
        if (item.startsWith(existingItem + path.sep)) {
          isNested = true;
          break;
        }
      }
      if (!isNested) {
        itemsToRemove.push(item);
      }
      filterBar.increment();
    }
    filterBar.stop();

    // 6. KONFIRMASI DAN PENGHAPUSAN
    console.log(chalk.yellow(`\nDitemukan ${itemsToRemove.length} folder utama untuk dihapus:`));
    itemsToRemove.forEach(item => console.log(`- ${item}`));

    const { confirmation } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmation',
        message: `Apakah Anda yakin ingin menghapus semua folder (${foldersToFind.join(', ')}) di atas? (y/n)`,
        default: false,
      }
    ]);

    if (!confirmation) {
      console.log(chalk.yellow('\nPenghapusan dibatalkan oleh pengguna.'));
      return;
    }

    setWindowTitle(`Menghapus ${itemsToRemove.length} Folder...`);
    console.log(chalk.cyan('\nMemulai proses penghapusan...'));
    const deleteBar = new cliProgress.SingleBar({
      format: `Menghapus Folder Sampah |${chalk.cyan('{bar}')}| {percentage}% || {value}/{total} | {folder}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    });

    deleteBar.start(itemsToRemove.length, 0, { folder: "N/A" });
    for (const folderPath of itemsToRemove) {
      const folderName = path.basename(folderPath);
      deleteBar.update({ folder: folderName });
      try {
        await fs.rm(folderPath, { recursive: true, force: true });
      } catch (error) {
        console.log(chalk.red(`\nGAGAL MENGHAPUS: ${folderPath}. Pesan Error: ${error.message}`));
      }
      deleteBar.increment();
    }
    deleteBar.stop();
    console.log(chalk.green('\nPembersihan selesai.'));

    showDonationMessage()

  } catch (error) {
    console.error(chalk.red('\nTerjadi error yang tidak terduga:'), error);
  } finally {
    // Kembalikan judul window
    setWindowTitle(originalTitle);
  }
}

main();