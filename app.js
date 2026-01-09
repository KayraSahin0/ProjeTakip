import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// --- AYARLAR (BİLGİLERİNİ GİR) ---
const firebaseConfig = {
    apiKey: "AIzaSyDQNAvWjyw3cxp2G4-b56-hb301cSEtoYs",
        authDomain: "projetakip-b0f82.firebaseapp.com",
        projectId: "projetakip-b0f82",
        storageBucket: "projetakip-b0f82.firebasestorage.app",
        messagingSenderId: "1039037986640",
        appId: "1:1039037986640:web:0bc9e533ee41af7f741e55",
        measurementId: "G-4TFNJ03M10"
};

// --- BAŞLATMA ---
let db, projectsCollection;
let projects = [];
let currentEditingProjectId = null;

// Hangi todo için işlem yapıldığını tutacak geçici değişkenler
let targetTodoProjectId = null;
let targetTodoIndex = null;

try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    projectsCollection = collection(db, "projects");
} catch (error) {
    console.error("Firebase başlatılamadı:", error);
}

// --- GLOBAL FONKSİYONLAR (WINDOW'A ATAMA) ---
window.setToday = (inputId) => {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById(inputId).value = today;
};
window.closeModal = (id) => document.getElementById(id).classList.remove('open');
window.openProjectModal = () => {
    document.getElementById('projectModal').classList.add('open');
    document.getElementById('projectForm').reset();
    document.getElementById('todoInputs').innerHTML = '';
    window.addTodoInput();
    window.setToday('pStartDate');
};
window.addTodoInput = () => {
    const div = document.createElement('div');
    div.style.display = 'flex'; div.style.gap = '10px'; div.style.marginBottom = '10px';
    div.innerHTML = `
        <input type="text" class="new-todo-text" placeholder="Yapılacak iş..." style="margin:0; flex:1;">
        <select class="new-todo-status" style="width:120px; margin:0; background-color: #1a1a2e;">
            <option value="Bekliyor">Bekliyor</option>
            <option value="Yapılıyor">Yapılıyor</option>
            <option value="Bitti">Bitti</option>
            <option value="Gerek Kalmadı">Gerek Kalmadı</option>
        </select>
    `;
    document.getElementById('todoInputs').appendChild(div);
};

// --- YENİ EKLENEN ÖZELLİKLER ---

// 1. Rastgele Renk Üretici
function getRandomColor() {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#F333FF', '#00E676', '#FFD700', '#00D2FF', '#FF9F43', '#ff7675', '#0984e3'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// 2. Öncelik Modalını Açma (Eski cyclePriority yerine geldi)
window.openPriorityModal = (projectId, index) => {
    targetTodoProjectId = projectId;
    targetTodoIndex = index;
    document.getElementById('priorityModal').classList.add('open');
};

// 3. Seçilen Önceliği Kaydetme 
window.setPriority = async (priorityValue) => {
    if (!targetTodoProjectId || targetTodoIndex === null) return;
    
    // Modalı hemen kapat (Hız hissi için veritabanını beklemiyoruz)
    window.closeModal('priorityModal');

    const p = projects.find(x => x.id === targetTodoProjectId);
    const newTodos = [...p.todos];
    newTodos[targetTodoIndex].priority = priorityValue;
    
    await updateProjectInDb(targetTodoProjectId, { todos: newTodos });
    
    // Değişkenleri sıfırla
    targetTodoProjectId = null;
    targetTodoIndex = null;
};

// 4. Finans Durumu Değiştirme
window.toggleFinanceStatus = async (projectId, event) => {
    event.stopPropagation();
    const p = projects.find(x => x.id === projectId);
    await updateProjectInDb(projectId, { isNonProfit: !p.isNonProfit });
};

// 5. Sonradan İş Ekleme
window.addTodoItem = async (id) => {
    const taskName = prompt("Yeni yapılacak işin adı nedir?");
    if(!taskName) return;
    const p = projects.find(x => x.id === id);
    const newTodos = [...(p.todos || []), { text: taskName, status: "Bekliyor", priority: 'rahat' }];
    await updateProjectInDb(id, { todos: newTodos });
};

// --- CORE MANTIK ---

function startListening() {
    if(!db) return;
    document.getElementById('loading').style.display = 'block';

    // Veritabanını canlı dinle
    onSnapshot(projectsCollection, (snapshot) => {
        projects = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Sıralama
        projects.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return b.createdAt - a.createdAt;
        });
        
        renderProjects();
        updateStats();
        
        // Yükleme bitti
        document.getElementById('loading').style.display = 'none';
    }, (error) => {
        console.error("Veri okuma hatası:", error);
    });
}

document.getElementById('projectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (firebaseConfig.apiKey === "SENIN_API_KEY_BURAYA") {
        alert("Lütfen app.js dosyasındaki firebaseConfig kısmını doldur!");
        return;
    }

    const todoItems = [];
    document.querySelectorAll('#todoInputs > div').forEach(row => {
        const txt = row.querySelector('.new-todo-text').value;
        const stat = row.querySelector('.new-todo-status').value;
        if(txt) todoItems.push({ text: txt, status: stat, priority: 'rahat' });
    });

    const newProjectData = {
        name: document.getElementById('pName').value,
        tech: document.getElementById('pTech').value.split(',').filter(t => t.trim()),
        startDate: document.getElementById('pStartDate').value,
        endDate: document.getElementById('pEndDate').value,
        realDate: document.getElementById('pRealDate').value || '',
        isNonProfit: document.getElementById('pNoProfit').checked,
        transactions: [],
        todos: todoItems,
        completed: false,
        createdAt: Date.now()
    };

    try {
        await addDoc(projectsCollection, newProjectData);
        window.closeModal('projectModal');
        fetchProjects();
    } catch (e) {
        alert("Hata: " + e.message);
    }
});

window.deleteProject = async (id) => {
    if(confirm('Projeyi silmek istediğine emin misin?')) {
        await deleteDoc(doc(db, "projects", id));
        fetchProjects();
    }
};

async function updateProjectInDb(id, newData) {
    const projectRef = doc(db, "projects", id);
    await updateDoc(projectRef, newData);
    fetchProjects();
}

window.toggleComplete = (id) => {
    const p = projects.find(x => x.id === id);
    if (!p.completed) {
        const allDone = p.todos.every(t => t.status === 'Bitti' || t.status === 'Gerek Kalmadı');
        if (!allDone) { alert('⚠️ Tüm işler bitmeli veya iptal edilmeli!'); return; }
        if (!p.realDate) p.realDate = new Date().toISOString().split('T')[0];
    }
    updateProjectInDb(id, { completed: !p.completed, realDate: p.realDate });
};

window.updateTodo = (id, index, newVal) => {
    const p = projects.find(x => x.id === id);
    const newTodos = [...p.todos];
    newTodos[index].status = newVal;
    updateProjectInDb(id, { todos: newTodos });
};

// Finans Fonksiyonları
window.openFinanceModal = (id) => {
    const p = projects.find(x => x.id === id);
    if(p.isNonProfit) return;
    currentEditingProjectId = id;
    document.getElementById('finModalTitle').innerText = `💰 ${p.name} - Finans`;
    renderFinanceList(p);
    document.getElementById('financeModal').classList.add('open');
};

function renderFinanceList(project) {
    const list = document.getElementById('financeList');
    list.innerHTML = '';
    if(!project.transactions || project.transactions.length === 0) { list.innerHTML = '<div style="text-align:center; color:#666;">Henüz işlem yok.</div>'; return; }
    
    project.transactions.forEach((t, index) => {
        const item = document.createElement('div');
        item.style.cssText = "display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:0.9rem;";
        item.innerHTML = `<span>${t.desc}</span><div style="display:flex; gap:10px; align-items:center;"><span class="${t.type === 'income' ? 'text-success' : 'text-danger'}">${t.type === 'income' ? '+' : '-'}₺${t.amount}</span><button onclick="window.deleteFinanceItem('${project.id}', ${index})" style="background:none; border:none; color:#666; cursor:pointer;"><i class="fa-solid fa-trash"></i></button></div>`;
        list.appendChild(item);
    });
}

window.addFinanceItem = async () => {
    const desc = document.getElementById('finDesc').value;
    const amount = Number(document.getElementById('finAmount').value);
    const type = document.getElementById('finType').value;
    if(!desc || amount <= 0) return;
    
    const p = projects.find(x => x.id === currentEditingProjectId);
    const newTrans = [...(p.transactions || []), { desc, amount, type }];
    await updateProjectInDb(currentEditingProjectId, { transactions: newTrans });
    document.getElementById('finDesc').value = '';
    document.getElementById('finAmount').value = '';
};

window.deleteFinanceItem = async (projectId, index) => {
    const p = projects.find(x => x.id === projectId);
    const newTrans = [...p.transactions];
    newTrans.splice(index, 1);
    await updateProjectInDb(projectId, { transactions: newTrans });
};

window.openReportModal = () => {
    const tbody = document.getElementById('reportTableBody');
    tbody.innerHTML = '';
    let validProjects = projects.filter(p => !p.isNonProfit);
    if(validProjects.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">İşlem yok.</td></tr>'; }
    else {
        validProjects.forEach(p => {
            const trans = p.transactions || [];
            const inc = trans.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount, 0);
            const exp = trans.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount, 0);
            const net = inc - exp;
            tbody.innerHTML += `<tr><td>${p.name}</td><td class="text-success">+₺${inc}</td><td class="text-danger">-₺${exp}</td><td style="font-weight:bold; color:${net>=0 ? 'var(--success)' : 'var(--danger)'}">₺${net}</td></tr>`;
        });
    }
    document.getElementById('reportModal').classList.add('open');
};

function getDaysDiff(d1, d2) {
    if(!d1 || !d2) return null;
    const diffTime = Math.abs(new Date(d2) - new Date(d1));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function updateStats() {
    let total = projects.length;
    let completed = projects.filter(p => p.completed).length;
    let totalNet = 0;
    projects.forEach(p => {
        if(!p.isNonProfit && p.transactions) {
            const inc = p.transactions.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount, 0);
            const exp = p.transactions.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount, 0);
            totalNet += (inc - exp);
        }
    });
    document.getElementById('totalCount').innerText = total;
    document.getElementById('activeCount').innerText = total - completed;
    document.getElementById('netFinance').innerHTML = totalNet >= 0 ? `+₺${totalNet}` : `<span class="text-danger">-₺${Math.abs(totalNet)}</span>`;
    const rate = total === 0 ? 0 : Math.round((completed/total)*100);
    document.getElementById('successRate').innerText = `%${rate}`;
    document.getElementById('progressBar').style.width = `${rate}%`;
}

function renderProjects() {
    const container = document.getElementById('projectsContainer');
    if (projects.length === 0) { container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:40px;">Henüz proje eklenmemiş.</div>`; return; }
    
    container.innerHTML = projects.map(p => {
        const trans = p.transactions || [];
        let income = 0, expense = 0;
        if(!p.isNonProfit) {
            income = trans.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount, 0);
            expense = trans.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount, 0);
        }

        let techHtml = p.tech.length ? p.tech.map(t => {
            const color = getRandomColor();
            return `<span class="tech-pill" style="border-color:${color}; color:${color}; box-shadow: 0 0 5px ${color}40;">${t}</span>`;
        }).join('') : '';
        
        let doneCount = (p.todos || []).filter(t => t.status === 'Bitti' || t.status === 'Gerek Kalmadı').length;
        let totalTodos = (p.todos || []).length;
        let todoPercent = totalTodos === 0 ? 0 : Math.round((doneCount / totalTodos) * 100);

        let durationHtml = '';
        if (p.startDate && p.endDate) {
            const estimatedDays = getDaysDiff(p.startDate, p.endDate);
            if(p.completed && p.realDate) {
                const actualDays = getDaysDiff(p.startDate, p.realDate);
                durationHtml = `<div class="duration-info"><div class="duration-actual">🏁 ${actualDays} Günde Tamamlandı</div><div class="duration-estimated">Öngörülen: ${estimatedDays} Gün</div></div>`;
            } else {
                durationHtml = `<div class="duration-info"><div class="duration-estimated" style="opacity:1;">📅 Tahmini Süre: ${estimatedDays} Gün</div></div>`;
            }
        }

        // 1. Önce listeyi orijinal indeksleriyle eşleştir
        let indexedTodos = (p.todos || []).map((t, index) => ({ ...t, originalIndex: index }));

        // 2. Sıralama: Bitmiş veya Gerek Kalmamış olanlar en sona
        indexedTodos.sort((a, b) => {
            const isDoneA = a.status === 'Bitti' || a.status === 'Gerek Kalmadı';
            const isDoneB = b.status === 'Bitti' || b.status === 'Gerek Kalmadı';
            if (isDoneA === isDoneB) return 0; // Durumları aynıysa sırayı bozma
            return isDoneA ? 1 : -1; // A bitmişse sona (1), değilse başa (-1)
        });

        // 3. Sıralanmış listeyi HTML'e çevir (Ama işlem yaparken originalIndex kullan!)
        let todoHtml = indexedTodos.map((t) => {
            const i = t.originalIndex; // Veritabanındaki gerçek sırası
            const isDone = t.status === 'Bitti' || t.status === 'Gerek Kalmadı';
            
            const priority = t.priority || 'rahat';
            let priorityColor = 'var(--text-muted)';
            if (priority === 'normal') priorityColor = 'var(--success)';
            if (priority === 'acil') priorityColor = 'var(--danger)';

            let iconHtml = isDone 
                ? `<i class="fa-solid fa-circle-check" style="color: var(--info); font-size:0.9rem;"></i>`
                : `<i class="fa-solid fa-circle" onclick="window.openPriorityModal('${p.id}', ${i})" style="color: ${priorityColor}; font-size:0.7rem; cursor:pointer; transition:0.2s;" title="Öncelik Değiştir"></i>`;

            return `<div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom:5px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    ${iconHtml}
                    <span style="${isDone ? 'text-decoration:line-through; color:var(--text-muted);' : ''} ${t.status === 'Gerek Kalmadı' ? 'font-style:italic;' : ''}">${t.text}</span>
                </div>
                <select onchange="window.updateTodo('${p.id}', ${i}, this.value)" style="width:auto; padding:2px 5px; margin:0; font-size:0.75rem; background:#111; border:none;">
                    <option ${t.status=='Bekliyor'?'selected':''}>Bekliyor</option>
                    <option ${t.status=='Yapılıyor'?'selected':''}>Yapılıyor</option>
                    <option ${t.status=='Bitti'?'selected':''}>Bitti</option>
                    <option ${t.status=='Gerek Kalmadı'?'selected':''}>Gerek Kalmadı</option>
                </select>
            </div>`;
        }).join('');

        let financeContent = '';
        if (p.isNonProfit) {
            financeContent = `<span style="width:100%; text-align:center; font-style:italic; color:var(--text-muted);">Hobi Projesi</span><button class="finance-toggle-btn" onclick="window.toggleFinanceStatus('${p.id}', event)" title="Gelir Modeline Çevir"><i class="fa-solid fa-dollar-sign"></i></button>`;
        } else {
            financeContent = `<div style="display:flex; flex-direction:column; gap:3px;"><span style="color:var(--text-muted); font-size:0.75rem;">Gelir/Gider</span><div><span class="text-success">+₺${income}</span> / <span class="text-danger">-₺${expense}</span></div></div><div style="text-align:right;"><span style="color:var(--text-muted); font-size:0.75rem;">Net</span><div style="font-weight:700; color:${(income-expense)>=0?'var(--success)':'var(--danger)'}">₺${income-expense}</div></div><button class="finance-toggle-btn" onclick="window.toggleFinanceStatus('${p.id}', event)" title="Hobi Modeline Çevir"><i class="fa-solid fa-ban"></i></button>`;
        }

        return `
        <div class="project-card">
            <div class="p-header">
                <div><div class="p-title">${p.name}</div><div style="font-size:0.75rem; color:var(--text-muted);">${p.startDate} - ${p.completed ? p.realDate : p.endDate}</div></div>
                <button onclick="window.toggleComplete('${p.id}')" style="border:none; background:none; cursor:pointer;"><span class="status-badge ${p.completed ? 'status-done' : 'status-active'}">${p.completed ? 'Tamamlandı' : 'Devam Ediyor'}</span></button>
            </div>
            <div class="card-progress-container"><div class="card-progress-text"><span>İlerleme</span> <span>%${todoPercent}</span></div><div class="card-progress-bar-bg"><div class="card-progress-fill" style="width: ${todoPercent}%"></div></div></div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">${techHtml}</div>
            <div class="p-finance ${p.isNonProfit ? 'p-finance-disabled' : ''}" style="position:relative; ${p.isNonProfit ? 'pointer-events:auto; opacity:1;' : ''}" onclick="${p.isNonProfit ? '' : `window.openFinanceModal('${p.id}')`}">${financeContent}</div>
            ${durationHtml}
            <div style="background:rgba(0,0,0,0.15); padding:15px; border-radius:16px;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;"><small style="color:var(--text-muted); font-weight:600;">YAPILACAKLAR</small><button onclick="window.addTodoItem('${p.id}')" style="background:none; border:none; color:var(--info); cursor:pointer; font-size:0.8rem; font-weight:bold;">+ Ekle</button></div><div style="max-height:150px; overflow-y:auto;">${p.todos && p.todos.length > 0 ? todoHtml : '<div style="text-align:center; font-size:0.8rem; color:#555;">Liste boş</div>'}</div></div>
            <div style="margin-top:auto; padding-top:10px; display:flex; justify-content:flex-end;"><button onclick="window.deleteProject('${p.id}')" style="color:var(--text-muted); background:none; border:none; cursor:pointer;"><i class="fa-solid fa-trash-can"></i> Sil</button></div>
        </div>`;
    }).join('');
}

// UYGULAMAYI BAŞLAT
startListening();