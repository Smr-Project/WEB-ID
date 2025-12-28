/* --- Code.gs (FINAL DENGAN HAPUS SEMUA PESANAN & HAPUS SEMUA WD ADMIN) --- */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Aplikasi Manajemen Saldo')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSheet(namaTab) {
  // ID SPREADSHEET (GANTI DENGAN ID ANDA)
  // PASTIKAN ID SPREADSHEET INI VALID
  var id = "1jORyJfwYVfuIV5j1xM6sducaPVUwTwRkAbgJccmgHy4"; 
  return SpreadsheetApp.openById(id).getSheetByName(namaTab);
}

/* =========================================
   1. AUTH & SALDO REALTIME
   ========================================= */
function checkLogin(idInput, passInput) {
  try {
    // ADMIN
    if (String(idInput).trim() === 'admin' && String(passInput).trim() === 'admin123') {
      return { status: 'sukses', role: 'admin', nama: 'Administrator', saldo: '-' };
    }
    
    // USER
    var sheet = getSheet('Users');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var dbId = String(data[i][0]).toLowerCase().trim();
      var dbPass = String(data[i][2]).trim();
      var dbStatus = String(data[i][3]).toLowerCase().trim(); // <--- KOLOM STATUS (Index 3)
      
      if (dbId === String(idInput).toLowerCase().trim() && dbPass === String(passInput).trim()) {
        
        if (dbStatus === 'pending') { 
          return { status: 'gagal', pesan: 'Akun Anda masih menunggu persetujuan Administrator.' };
        }
        if (dbStatus === 'rejected') { 
          return { status: 'gagal', pesan: 'Akun Anda telah ditolak oleh Administrator.' };
        }
        
        // Login Sukses (Status 'Approved')
        var namaUser = data[i][1]; 
        var saldoReal = hitungSaldoRealtime(namaUser);
        return { status: 'sukses', role: 'user', nama: namaUser, saldo: formatRupiah(saldoReal) };
      }
    }
    return { status: 'gagal', pesan: 'ID atau Password salah!' };
  } catch (e) { return { status: 'error', pesan: e.toString() }; }
}

function hitungSaldoRealtime(username) {
  var totalFee = 0, totalTarik = 0;
  var totalAdjustment = 0;
  var userTarget = String(username).toLowerCase().trim();

  // Pemasukan (Fee) - Index 12
  var sheetOrder = getSheet('Pesanan');
  if (sheetOrder) {
    var dataOrder = sheetOrder.getDataRange().getValues();
    for (var i = 1; i < dataOrder.length; i++) {
      if (String(dataOrder[i][1]).toLowerCase().trim() == userTarget) {
        totalFee += parseNumber(dataOrder[i][12]); 
      }
    }
  }
  // Pengeluaran (Tarik)
  var sheetWD = getSheet('Penarikan');
  if (sheetWD) {
    var dataWD = sheetWD.getDataRange().getValues();
    for (var j = 1; j < dataWD.length; j++) {
      var wdUser = String(dataWD[j][1]).toLowerCase().trim();
      var status = String(dataWD[j][7]).toLowerCase().trim();
      if (wdUser === userTarget) {
        // Saldo terpotong jika status Di Proses, Disetor, atau Berhasil
        if (status.includes('proses') || status.includes('setor') || status.includes('berhasil')) {
           totalTarik += parseNumber(dataWD[j][6]);
        }
      }
    }
  }
  
  // Penyesuaian Manual
  var sheetAdj = getSheet('ManualAdjustments');
  if (sheetAdj) {
    var dataAdj = sheetAdj.getDataRange().getValues();
    for (var k = 1; k < dataAdj.length; k++) {
      // Kolom B (Index 1) = Username, Kolom C (Index 2) = Amount
      if (String(dataAdj[k][1]).toLowerCase().trim() == userTarget) {
        totalAdjustment += parseNumber(dataAdj[k][2]);
      }
    }
  }

  // Hitung Saldo Akhir
  return totalFee - totalTarik + totalAdjustment;
}

function getSaldoRealtime(username) {
  try {
    var saldo = hitungSaldoRealtime(username);
    return { status: 'sukses', saldo: formatRupiah(saldo) };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}

function parseNumber(val) {
  if (!val) return 0;
  var str = String(val).replace(/[^0-9-]/g, ""); 
  var num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function registerUser(form) {
  try {
    var sheet = getSheet('Users');
    var id = String(form.regId).trim(), nama = form.regNama.trim(), pass = form.regPass;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).toLowerCase() == id.toLowerCase()) return { status: 'error', pesan: 'ID sudah dipakai!' };
    }
    // Tambahkan kolom Status dan Tgl Daftar
    sheet.appendRow([id, nama, pass, 'Pending', new Date()]); // <--- STATUS AWAL 'Pending'
    return { status: 'sukses', pesan: 'Pendaftaran berhasil. Akun Anda akan aktif setelah disetujui Administrator.' }; // <--- PESAN BARU
  } catch (e) { return { status: 'error', pesan: e.toString() }; }
}

/* =========================================
   2. USER DATA FEATURES
   ========================================= */
function getDropdownData() {
  try {
    var sheet = getSheet('Master'); if (!sheet) return { produk: [], alamat: [] };
    var data = sheet.getRange(2, 1, sheet.getLastRow()-1, 2).getValues();
    var p = [], a = [];
    data.forEach(r => { if(r[0]) p.push(r[0]); if(r[1]) a.push(r[1]); });
    return { produk: p, alamat: a };
  } catch (e) { return { produk: [], alamat: [] }; }
}

function prosesPesanan(form) {
  try {
    var sheet = getSheet('Pesanan');
    var mode = form.modeInput, oldId = form.editId;
    var resiBaru = String(form.inResi).trim(); 
    var statusBaru = String(form.inKet).toLowerCase().trim(); 
    var hargaMaxAdmin = parseNumber(form.inHargaMaxAdmin); 

    var statusDuplikasiCek = ['dalam pengiriman', 'dikirim', 'telah diterima', 'diterima'];
    
    var dataSheet = sheet.getDataRange().getValues();

    if (mode === 'edit' && oldId) {
      for (var i = 1; i < dataSheet.length; i++) {
        var existingId = String(dataSheet[i][0]);
        
        if (existingId == String(oldId)) {
          var resiLama = String(dataSheet[i][9]).trim(); // Index 9: Resi
          
          if (resiBaru && resiBaru !== resiLama && statusDuplikasiCek.includes(statusBaru)) {
              if (checkResiDuplikat(sheet, resiBaru, existingId)) {
                  return { status: 'error', pesan: 'Gagal Update! No Resi sudah pernah digunakan di pesanan lain.' };
              }
          }
          
          var feeLama = dataSheet[i][12]; // Index 12: Fee
          
          var finalData = [
              form.inPenerima, form.inProduk, form.inJumlah, form.inAlamat, 
              parseNumber(form.inHarga), 
              hargaMaxAdmin,             
              form.inNoPesan,            
              form.inResi,               
              form.inKet,                
              form.inTgl,                
              feeLama                    
          ];
          
          sheet.getRange(i + 1, 3, 1, 11).setValues([finalData]);
          return { status: 'sukses', pesan: 'Data diupdate!' };
        }
      }
      return { status: 'error', pesan: 'ID tidak ditemukan.' };
    } else {
      // MODE BARU
      if (resiBaru && statusDuplikasiCek.includes(statusBaru)) {
        if (checkResiDuplikat(sheet, resiBaru)) {
            return { status: 'error', pesan: 'Gagal Simpan! No Resi sudah pernah digunakan di pesanan lain.' };
        }
      }
      
      var id = 'ORD-' + new Date().getTime();
      
      sheet.appendRow([
          id, 
          form.hideUser, 
          form.inPenerima, 
          form.inProduk, 
          form.inJumlah, 
          form.inAlamat, 
          parseNumber(form.inHarga),
          hargaMaxAdmin, // Index 7
          form.inNoPesan, 
          form.inResi, 
          form.inKet, 
          form.inTgl, 
          0 // Fee (Index 12)
      ]); 
      return { status: 'sukses', pesan: 'Tersimpan!' };
    }
  } catch (e) { return { status: 'error', pesan: e.toString() }; }
}

function checkResiDuplikat(sheet, resi, excludeId) {
  var data = sheet.getDataRange().getValues();
  var resiTrimmed = String(resi).trim();
  var statusDuplikasiCek = ['dalam pengiriman', 'dikirim', 'telah diterima', 'diterima'];

  for (var i = 1; i < data.length; i++) {
    var dbId = String(data[i][0]);
    var dbResi = String(data[i][9]).trim(); // Index 9: Resi
    var dbStatus = String(data[i][10]).toLowerCase().trim(); // Index 10: Status

    if (excludeId && dbId === excludeId) continue;

    if (dbResi === resiTrimmed && statusDuplikasiCek.includes(dbStatus)) {
      return true; // Duplikat ditemukan
    }
  }
  return false; // Tidak ada duplikat
}


function getPesananUser(username) {
  try {
    var sheet = getSheet('Pesanan'); if(!sheet) return [];
    var data = sheet.getDataRange().getValues();
    var hasil = [];
    var target = String(username).toLowerCase().trim();
    var fmt = d => { try { return new Date(d).toISOString().split('T')[0]; } catch(e){ return d;} };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase().trim() == target) {
        hasil.push({
          id: data[i][0], 
          username: data[i][1], 
          penerima: data[i][2], 
          produk: data[i][3],
          jumlah: data[i][4], 
          alamat: data[i][5], 
          harga: formatRupiah(data[i][6]),
          hargaMaxAdmin: formatRupiah(data[i][7]||0), // Index 7
          noPesan: data[i][8],  // Index 8
          resi: data[i][9],     // Index 9
          ket: data[i][10],     // Index 10
          tgl: fmt(data[i][11]), // Index 11
          fee: formatRupiah(data[i][12]||0) // Index 12
        });
      }
    }
    return hasil.reverse();
  } catch (e) { return []; }
}

function getFeeUser(username) {
  try {
    var sheet = getSheet('Pesanan'); if(!sheet) return [];
    var data = sheet.getDataRange().getValues(); var hasil = [];
    var target = String(username).toLowerCase().trim();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase().trim() == target) {
        var fee = parseNumber(data[i][12]); // Index 12: Fee
        hasil.push({ 
            penerima: data[i][2], 
            produk: data[i][3], 
            alamat: data[i][5], 
            noPesan: data[i][8], // Index 8
            fee: formatRupiah(fee) 
        });
      }
    }
    return hasil.reverse();
  } catch (e) { return []; }
}

function getRiwayatTarik(username) {
  try {
    var sheet = getSheet('Penarikan'); if(!sheet) return [];
    var data = sheet.getDataRange().getValues(); var hasil = [];
    var target = String(username).toLowerCase().trim();
    var fmt = d => { try { return new Date(d).toISOString().split('T')[0]; } catch(e){ return "Baru";} };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase().trim() == target) {
        hasil.push({ 
          tgl: fmt(data[i][2]), 
          noRek: data[i][3], 
          pemilik: data[i][4], 
          bank: data[i][5], 
          nominal: data[i][6], 
          nominalFmt: formatRupiah(data[i][6]), 
          status: data[i][7] 
        });
      }
    }
    return hasil.reverse();
  } catch (e) { return []; }
}

function simpanPenarikan(form) {
  try {
    // Pengecekan Status Global
    var wdStatus = getWithdrawStatus();
    if (wdStatus.status === 'sukses' && !wdStatus.aktif) {
      return { status: 'error', pesan: 'Fitur penarikan sedang dinonaktifkan oleh Administrator.' };
    }
    
    var sheet = getSheet('Penarikan');
    var id = 'WD-' + new Date().getTime();
    var user = form.hideUserTarik;
    var minta = parseNumber(form.tarikNominal);
    
    var saldoNow = hitungSaldoRealtime(user);
    if (saldoNow < minta) {
       return { status: 'error', pesan: 'Saldo tidak cukup! Sisa: ' + formatRupiah(saldoNow) };
    }
    
    sheet.appendRow([id, user, new Date(), form.tarikNoRek, form.tarikPemilik, form.tarikBank, minta, 'Di Proses']);
    return { status: 'sukses', pesan: 'Permintaan dikirim!' };
  } catch (e) { return { status: 'error', pesan: e.toString() }; }
}

function hapusPesanan(id) {
  try {
    var s = getSheet('Pesanan'); var d = s.getDataRange().getValues();
    for(var i=1; i<d.length; i++){ 
      if(String(d[i][0])==String(id)){ 
        s.deleteRow(i+1); 
        return{status:'sukses',pesan:'Dihapus'}; 
      } 
    }
    return {status:'error'};
  } catch(e){return{status:'error',pesan:e.toString()};}
}

/* =========================================
   3. ADMIN FEATURES (STATS & LOGIC)
   ========================================= */

// FUNGSI UNTUK MENGHITUNG STATUS PESANAN
function getAdminOrderStatusCounts() {
  try {
    var sheet = getSheet('Pesanan');
    if (!sheet || sheet.getLastRow() < 2) {
      return { status: 'sukses', counts: { total: 0, dikirim: 0, diterima: 0, dibatalkan: 0 } };
    }
    
    var data = sheet.getDataRange().getValues();
    
    var counts = {
      total: data.length - 1, 
      dikirim: 0,
      diterima: 0,
      dibatalkan: 0
    };

    for (var i = 1; i < data.length; i++) {
      var status = String(data[i][10]).toLowerCase().trim(); // Index 10: Status

      if (status === 'dalam pengiriman' || status === 'dikirim') { 
        counts.dikirim++;
      } else if (status === 'telah diterima' || status === 'diterima') { 
        counts.diterima++;
      } else if (status.includes('batal') || status.includes('tolak') || status.includes('gagal')) {
        counts.dibatalkan++;
      }
    }
    
    return { status: 'sukses', counts: counts };
    
  } catch (e) {
    return { status: 'error', pesan: 'Gagal menghitung status pesanan: ' + e.toString() };
  }
}

function getAdminStatistics() {
  try {
    var totalSaldo = 0, pendingWD = 0, totalOrder = 0, totalUser = 0;
    
    var wdCounts = {
        diproses: 0,
        disetor: 0,
        berhasil: 0,
        ditolak: 0,
        total: 0
    };

    // 1. User Stats
    var sUser = getSheet('Users');
    if(sUser) {
      var dUser = sUser.getDataRange().getValues();
      totalUser = dUser.length - 1;
      for(var i=1; i<dUser.length; i++) totalSaldo += hitungSaldoRealtime(dUser[i][1]);
    }
    
    // 2. WD Stats
    var sWD = getSheet('Penarikan');
    if(sWD) {
      var dWD = sWD.getDataRange().getValues();
      wdCounts.total = dWD.length - 1;

      for(var i=1; i<dWD.length; i++) {
          var status = String(dWD[i][7]).toLowerCase().trim();

          if (status.includes('proses')) {
              wdCounts.diproses++;
              pendingWD += parseNumber(dWD[i][6]); 
          } else if (status.includes('setor')) {
              wdCounts.disetor++;
          } else if (status.includes('berhasil')) {
              wdCounts.berhasil++;
          } else if (status.includes('ditolak') || status.includes('batal')) {
              wdCounts.ditolak++;
          }
      }
    }
    
    // 3. Order Stats 
    var orderCounts = getAdminOrderStatusCounts();
    if (orderCounts.status === 'sukses') {
        totalOrder = orderCounts.counts.total;
    }

    return { 
        users: totalUser, 
        saldo: formatRupiah(totalSaldo), 
        pending: formatRupiah(pendingWD), 
        orders: totalOrder,
        orderBreakdown: orderCounts.counts,
        wdBreakdown: wdCounts 
    };
  } catch(e) { return { users:0, saldo:0, pending:0, orders:0, orderBreakdown:{}, wdBreakdown:{} }; }
}

function adminGetData(type) {
  try {
    var sheet, data, hasil = [];
    var fmtDate = d => { try { return new Date(d).toISOString().split('T')[0]; } catch(e){ return "";} };

    if (type === 'withdraw') {
      sheet = getSheet('Penarikan'); data = sheet.getDataRange().getValues();
      for(var i=1; i<data.length; i++) {
        hasil.push({
          id: data[i][0], username: data[i][1], tgl: fmtDate(data[i][2]),
          noRek: data[i][3], pemilik: data[i][4], bank: data[i][5],
          nominal: data[i][6], nominalFmt: formatRupiah(data[i][6]), status: data[i][7] 
        });
      }
    } else if (type === 'orders') {
      sheet = getSheet('Pesanan'); data = sheet.getDataRange().getValues();
      for(var i=1; i<data.length; i++) {
        hasil.push({ 
          id: data[i][0], 
          username: data[i][1], 
          penerima: data[i][2], 
          produk: data[i][3], 
          jumlah: data[i][4], 
          alamat: data[i][5], 
          harga: formatRupiah(data[i][6]),
          hargaMaxAdmin: formatRupiah(data[i][7]||0), // Index 7
          noPesan: data[i][8],  // Index 8
          resi: data[i][9],     // Index 9
          ket: data[i][10],     // Index 10
          tgl: fmtDate(data[i][11]), // Index 11
          fee: parseNumber(data[i][12]), // Index 12
          feeFmt: formatRupiah(data[i][12]||0) // Index 12
        });
      }
    } else if (type === 'users') {
      sheet = getSheet('Users'); data = sheet.getDataRange().getValues();
      var fmt = d => { try { return new Date(d).toISOString().split('T')[0]; } catch(e){ return "";} };
      for(var i=1; i<data.length; i++) {
        var s = hitungSaldoRealtime(data[i][1]);
        hasil.push({ 
            id:data[i][0], 
            nama:data[i][1], 
            saldo:formatRupiah(s),
            status: data[i][3] || 'Pending', // Index 3
            tglDaftar: fmt(data[i][4]) // Index 4
        });
      }
    }
    return hasil.reverse();
  } catch (e) { return []; }
}

/**
 * Fungsi untuk menghapus SEMUA pesanan berdasarkan username.
 * @param {string} username - Nama pengguna.
 */
function adminDeleteAllOrdersByUser(username) {
  try {
    var sheet = getSheet('Pesanan');
    if (!sheet) return { status: 'error', pesan: 'Sheet Pesanan tidak ditemukan.' };
    
    var data = sheet.getDataRange().getValues();
    var target = String(username).toLowerCase().trim();
    var deletedCount = 0;
    
    // Iterasi mundur untuk menghapus baris tanpa mengganggu index iterasi
    for (var i = data.length - 1; i >= 1; i--) {
      var dbUser = String(data[i][1]).toLowerCase().trim(); // Index 1 adalah Username
      
      if (dbUser === target) {
        sheet.deleteRow(i + 1); // deleteRow menggunakan 1-based index
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      return { status: 'sukses', pesan: `${deletedCount} pesanan untuk ${username} berhasil dihapus.` };
    } else {
      return { status: 'error', pesan: `Tidak ada pesanan ditemukan untuk ${username}.` };
    }
  } catch(e) { 
    return { status: 'error', pesan: 'Gagal menghapus pesanan: ' + e.toString() }; 
  }
}

/**
 * BARU: Fungsi untuk menghapus SEMUA penarikan berdasarkan username.
 * @param {string} username - Nama pengguna.
 */
function adminDeleteAllWDByUser(username) {
  try {
    var sheet = getSheet('Penarikan');
    if (!sheet) return { status: 'error', pesan: 'Sheet Penarikan tidak ditemukan.' };
    
    var data = sheet.getDataRange().getValues();
    var target = String(username).toLowerCase().trim();
    var deletedCount = 0;
    
    // Iterasi mundur untuk menghapus baris tanpa mengganggu index iterasi
    for (var i = data.length - 1; i >= 1; i--) {
      var dbUser = String(data[i][1]).toLowerCase().trim(); // Index 1 adalah Username
      
      if (dbUser === target) {
        sheet.deleteRow(i + 1); // deleteRow menggunakan 1-based index
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      return { status: 'sukses', pesan: `${deletedCount} riwayat penarikan untuk ${username} berhasil dihapus.` };
    } else {
      return { status: 'error', pesan: `Tidak ada riwayat penarikan ditemukan untuk ${username}.` };
    }
  } catch(e) { 
    return { status: 'error', pesan: 'Gagal menghapus riwayat penarikan: ' + e.toString() }; 
  }
}

function adminUpdateStatusWD(idWd, statusBaru) {
  try {
    var sheet = getSheet('Penarikan'); var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) == String(idWd)) {
        sheet.getRange(i + 1, 8).setValue(statusBaru); 
        return { status: 'sukses', pesan: 'Status: ' + statusBaru };
      }
    }
    return { status: 'error', pesan: 'ID tidak ditemukan' };
  } catch (e) { return { status: 'error', pesan: e.toString() }; }
}

function adminUpdateFee(idOrder, nominal) {
  try {
    var sheet = getSheet('Pesanan'); var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) == String(idOrder)) {
        var feeAngka = parseNumber(nominal);
        sheet.getRange(i + 1, 13).setValue(feeAngka); // Index 12 (Kolom M)
        return { status: 'sukses', pesan: 'Bonus dikirim!', fee: formatRupiah(feeAngka) };
      }
    }
    return { status: 'error', pesan: 'Order tidak ditemukan' };
  } catch (e) { return { status: 'error', pesan: e.toString() }; }
}

function adminDeleteUser(idUser) {
  try {
    var sheet = getSheet('Users');
    var data = sheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++){ 
      if(String(data[i][0])==String(idUser)){ 
        sheet.deleteRow(i+1); 
        return {status:'sukses',pesan:'Pengguna dihapus'}; 
      } 
    }
    return {status:'error', pesan:'ID pengguna tidak ditemukan'};
  } catch(e){ return{status:'error',pesan:e.toString()}; }
}

function adminAdjustUserBalance(username, nominal, notes) {
  try {
    var ss = SpreadsheetApp.openById("1jORyJfwYVfuIV5j1xM6sducaPVUwTwRkAbgJccmgHy4");
    var sheet = ss.getSheetByName('ManualAdjustments');
    
    if (!sheet) {
      sheet = ss.insertSheet('ManualAdjustments');
      sheet.getRange(1,1,1,4).setValues([['Timestamp', 'Username', 'Amount', 'Notes']]);
    }

    var amount = parseNumber(nominal);
    sheet.appendRow([new Date(), username, amount, notes || 'Penyesuaian Saldo Admin']);

    var newSaldo = hitungSaldoRealtime(username);

    return { status: 'sukses', pesan: `Saldo ${username} berhasil disesuaikan. Saldo baru: ${formatRupiah(newSaldo)}` };

  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}

function adminSetUserStatus(id, statusBaru) {
  try {
    var sheet = getSheet('Users');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) == String(id)) {
        // Kolom D (Index 3) adalah Status
        sheet.getRange(i + 1, 4).setValue(statusBaru); 
        return { status: 'sukses', pesan: `Status pengguna ${data[i][1]} diubah menjadi ${statusBaru}` };
      }
    }
    return { status: 'error', pesan: 'ID pengguna tidak ditemukan' };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}


/* =========================================
   4. USER PROFILE MANAGEMENT
   ========================================= */

function updateUserPassword(username, newPass) {
  try {
    var sheet = getSheet('Users');
    var data = sheet.getDataRange().getValues();
    var target = String(username).toLowerCase().trim();
    
    for (var i = 1; i < data.length; i++) {
      var dbNama = String(data[i][1]).toLowerCase().trim(); 
      if (dbNama === target) {
        // Kolom C (Index 2) adalah Password
        sheet.getRange(i + 1, 3).setValue(newPass.trim());
        return { status: 'sukses', pesan: 'Password berhasil diubah!' };
      }
    }
    return { status: 'error', pesan: 'Pengguna tidak ditemukan.' };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}

function getUserBankDetails(username) {
  try {
    var props = PropertiesService.getUserProperties();
    var prefix = String(username).toLowerCase().trim() + '_';
    
    var bank = props.getProperty(prefix + 'bank') || '';
    var noRek = props.getProperty(prefix + 'noRek') || '';
    var pemilik = props.getProperty(prefix + 'pemilik') || '';
    
    return { status: 'sukses', bank: bank, noRek: noRek, pemilik: pemilik };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}

function saveUserBankDetails(form) {
  try {
    var props = PropertiesService.getUserProperties();
    var username = String(form.profUser).toLowerCase().trim();
    var prefix = username + '_';
    
    props.setProperty(prefix + 'bank', form.profBank);
    props.setProperty(prefix + 'noRek', form.profNoRek);
    props.setProperty(prefix + 'pemilik', form.profPemilik);
    
    return { status: 'sukses', pesan: 'Detail Bank berhasil disimpan!' };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}


/* =========================================
   5. GLOBAL WITHDRAW CONTROL (PROPERTIES SERVICE)
   ========================================= */

function getWithdrawStatus() {
  try {
    var props = PropertiesService.getScriptProperties();
    var status = props.getProperty('TarikAktif') || 'true'; 
    return { status: 'sukses', aktif: (status === 'true') };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}

function toggleWithdrawStatus(aktif) {
  try {
    var props = PropertiesService.getScriptProperties();
    var status = aktif ? 'true' : 'false';
    props.setProperty('TarikAktif', status);
    return { status: 'sukses', aktif: aktif, pesan: 'Status penarikan berhasil diubah menjadi: ' + (aktif ? 'AKTIF' : 'NONAKTIF') };
  } catch (e) {
    return { status: 'error', pesan: e.toString() };
  }
}

function formatRupiah(angka) { 
  try { 
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka); 
  } catch (e) { 
    return "Rp " + angka; 
  } 
}
