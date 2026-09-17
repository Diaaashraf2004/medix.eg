function initMigration() {
  const startBtn = document.getElementById('startBtn');
  const loginBtn = document.getElementById('loginBtn');
  const statusDiv = document.getElementById('status');
  const loginSection = document.getElementById('loginSection');
  const migrationSection = document.getElementById('migrationSection');
  
  if (!window.FirebaseDB || !window.FirebaseDB.db) {
    statusDiv.innerHTML = '<span class="error">Firebase connection failed! Check your internet or config.</span>';
    return;
  }
  
  const { db, doc, getDoc, collection, writeBatch, setDoc } = window.FirebaseDB;
  
  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;
    
    if (!email || !password) return;
    
    loginBtn.disabled = true;
    statusDiv.innerHTML = '<span class="warning">Authenticating...</span>';
    
    try {
      await window.FirebaseAuth.signInWithEmailAndPassword(window.FirebaseAuth.auth, email, password);
      statusDiv.innerHTML = '<span class="success">Authenticated successfully. Ready to migrate.</span>';
      loginSection.style.display = 'none';
      migrationSection.style.display = 'block';
    } catch (e) {
      statusDiv.innerHTML = `<span class="error">Login failed: ${e.message}</span>`;
      loginBtn.disabled = false;
    }
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    statusDiv.innerHTML = '<span class="warning">Checking migration status...</span>';
    
    try {
      // 1. Check idempotency flag
      const configRef = doc(db, "system_config", "migration");
      const configSnap = await getDoc(configRef);
      if (configSnap.exists && typeof configSnap.data === 'function' && configSnap.data().migration_completed === true) {
        statusDiv.innerHTML = '<span class="success">Migration was already completed previously. No action needed!</span>';
        return;
      }
      
      const collectionsToMigrate = [
        'lr_products_v2', 'lr_categories_v2', 'lr_orders_v2', 'lr_coupons_v2', 'lr_reviews_v2', 'lr_customers_v2'
      ];
      
      let totalItemsMigrated = 0;
      
      for (const key of collectionsToMigrate) {
        statusDiv.innerHTML = `<span class="warning">Reading old ${key} array...</span>`;
        const oldDocRef = doc(db, "store_data", key);
        const oldSnap = await getDoc(oldDocRef);
        
        if (oldSnap.exists && typeof oldSnap.data === 'function') {
          const dataArray = oldSnap.data().data;
          if (Array.isArray(dataArray) && dataArray.length > 0) {
            statusDiv.innerHTML = `<span class="warning">Migrating ${dataArray.length} items to the new '${key}' collection...</span>`;
            
            // Firestore batches allow up to 500 writes
            let batch = writeBatch(db);
            let batchCount = 0;
            
            for (let i = 0; i < dataArray.length; i++) {
              const item = dataArray[i];
              if (!item || !item.id) continue;
              
              const newRef = doc(db, key, String(item.id));
              batch.set(newRef, item);
              batchCount++;
              
              if (batchCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                batchCount = 0;
              }
            }
            
            if (batchCount > 0) {
              await batch.commit();
            }
            
            totalItemsMigrated += dataArray.length;
          }
        }
      }
      
      statusDiv.innerHTML = `<span class="warning">Finalizing migration flag...</span>`;
      await setDoc(configRef, { migration_completed: true, migratedAt: new Date().toISOString() }, { merge: true });
      
      statusDiv.innerHTML = `<span class="success">Migration Complete! Successfully migrated ${totalItemsMigrated} items. You may now upload your updated files to production.</span>`;
      
    } catch (error) {
      console.error("Migration error:", error);
      statusDiv.innerHTML = `<span class="error">Migration failed: ${error.message}</span>`;
      startBtn.disabled = false;
    }
  });
}

if (window.FirebaseDB && window.FirebaseDB.db) {
  initMigration();
} else {
  window.addEventListener('firebase-ready', initMigration);
}
