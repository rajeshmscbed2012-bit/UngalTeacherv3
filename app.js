const firebaseConfig = {
    apiKey: "AIzaSyCUeWw384CaVwHqnwfFJ8n-JpudiVbENCg",
    authDomain: "students-quiz-5a367.firebaseapp.com",
    projectId: "students-quiz-5a367",
    storageBucket: "students-quiz-5a367.firebasestorage.app",
    messagingSenderId: "969090839069",
    appId: "1:969090839069:web:8619a9b3461ebcf6c30cf4"
};

let db;
if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
    db = firebase.firestore();
}

const TEACHERS_DATA = {
    "tamil": { password: "123", name: "தமிழ் ஆசிரியர்", subject: "தமிழ்", classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] },
    "english": { password: "123", name: "ஆங்கில ஆசிரியர்", subject: "ஆங்கிலம்", classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] },
    "admin": { password: "admin", name: "தலைமை ஆசிரியர்", subject: "அனைத்தும்", classes: ["1","2","3","4","5","6","7","8","9","10","11","12"] }
};

let loggedInTeacher = null, loggedInStudent = "", loggedInClass = "";
let currentActiveSubject = "", activeQuizType = "mcq";
let currentQuestions = [], currentQuestionIndex = 0;
let score = 0, wrongCount = 0, missedCount = 0, timerInterval, timeLeft = 30;
let userAnswersLog = [], itemToDelete = null;
let quizActive = false;

// --- Sound Setup ---
let soundEnabled = true;
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function toggleSound() {
    soundEnabled = !soundEnabled;
    document.getElementById('sound-toggle').innerText = soundEnabled ? '🔊' : '🔇';
}

function playSound(type) {
    if (!soundEnabled) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    if (type === 'correct') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'wrong') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.3);
    }
}
// -------------------

// DOMContentLoaded handled by inline script in HTML
// SW registration only
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function(err) { console.warn('SW:', err); });
    });
}

function showScreen(screenId) {
    document.querySelectorAll('.container').forEach(function(c){ c.classList.add('hidden'); });
    var el = document.getElementById(screenId);
    if (el) el.classList.remove('hidden');
}

function goHome() {
    if (timerInterval) clearInterval(timerInterval);
    quizActive = false;
    showScreen('student-login-screen');
}

function checkAdminLogin() {
    if (loggedInTeacher) { setupAdminUI(); showScreen('admin-screen'); switchAdminTab('mcq'); }
    else { showScreen('admin-login-screen'); }
}

function verifyTeacherLogin() {
    const user = document.getElementById('teacher-username').value.trim().toLowerCase();
    const pass = document.getElementById('admin-password').value.trim();
    const errorMsg = document.getElementById('pwd-error');
    if (TEACHERS_DATA[user] && TEACHERS_DATA[user].password === pass) {
        loggedInTeacher = TEACHERS_DATA[user];
        errorMsg.classList.add('hidden');
        document.getElementById('teacher-username').value = '';
        document.getElementById('admin-password').value = '';
        setupAdminUI();
        showScreen('admin-screen'); switchAdminTab('mcq');
    } else {
        errorMsg.innerText = "தவறான பயனர்பெயர் அல்லது கடவுச்சொல்! ❌";
        errorMsg.classList.remove('hidden');
    }
}

function adminLogout() { loggedInTeacher = null; goHome(); }

function setupAdminUI() {
    document.getElementById('admin-welcome-text').innerHTML = `⚙️ ஆசிரியர் பக்கம் <br><span style="font-size:14px; color:#475569;">${loggedInTeacher.name}</span>`;
    let subjectHtml = loggedInTeacher.subject === "அனைத்தும்" 
        ? `<option value="தமிழ்">தமிழ்</option><option value="ஆங்கிலம்">ஆங்கிலம்</option><option value="கணிதம்">கணிதம்</option><option value="அறிவியல்">அறிவியல்</option><option value="சமூக அறிவியல்">சமூக அறிவியல்</option>`
        : `<option value="${loggedInTeacher.subject}">${loggedInTeacher.subject}</option>`;
    ['bulk-subject', 'desc-subject', 'manage-subject', 'score-filter'].forEach(id => { let el = document.getElementById(id); if(el) el.innerHTML = subjectHtml; });
    let classHtml = `<option value="">வகுப்பு தேர்வு</option>`;
    loggedInTeacher.classes.sort((a,b)=>a-b).forEach(cls => { classHtml += `<option value="${cls}">${cls} ஆம் வகுப்பு</option>`; });
    ['bulk-class', 'desc-class', 'manage-class'].forEach(id => { let el = document.getElementById(id); if(el) el.innerHTML = classHtml; });
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    ['mcq','desc','manage','scores'].forEach(t => document.getElementById('admin-' + t + '-section').classList.add('hidden'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('admin-' + tab + '-section').classList.remove('hidden');
    if (tab === 'scores') loadLeaderboard();
    if (tab === 'manage') loadManageQuestions();
}

function verifyStudentLogin() {
    const name = document.getElementById('student-name').value.trim();
    const cls = document.getElementById('student-class').value;
    const errorMsg = document.getElementById('student-error');
    if (!name) { errorMsg.innerText = "உங்கள் பெயரை உள்ளிடவும்! ❌"; errorMsg.classList.remove('hidden'); return; }
    if (!cls) { errorMsg.innerText = "வகுப்பைத் தேர்ந்தெடுக்கவும்! ❌"; errorMsg.classList.remove('hidden'); return; }
    
    loggedInStudent = name; loggedInClass = cls;
    localStorage.setItem("quiz_student_name", loggedInStudent);
    localStorage.setItem("quiz_student_class", loggedInClass);
    errorMsg.classList.add('hidden');
    document.getElementById('student-name').value = ''; document.getElementById('student-class').value = '';
    
    if ('speechSynthesis' in window) {
        let speech = new SpeechSynthesisUtterance("வணக்கம் " + loggedInStudent);
        speech.lang = 'ta-IN'; 
        window.speechSynthesis.speak(speech);
    }

    var welEl = document.getElementById('welcome-text');
    if (welEl) {
        welEl.innerHTML =
            '<span style="font-size:18px;font-weight:900;color:#fff;display:block;">' + loggedInStudent + '</span>' +
            '<span style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.8);">' + loggedInClass + ' ஆம் வகுப்பு</span>';
    }
    showScreen('subject-screen');
}

function studentLogout() {
    localStorage.removeItem("quiz_student_name");
    localStorage.removeItem("quiz_student_class");
    loggedInStudent = ""; loggedInClass = "";
    quizActive = false;
    if (timerInterval) clearInterval(timerInterval);
    document.querySelectorAll('.container').forEach(function(c){ c.classList.add('hidden'); });
    document.getElementById('student-login-screen').classList.remove('hidden');
    var nameEl = document.getElementById('student-name');
    var clsEl  = document.getElementById('student-class');
    if (nameEl) nameEl.value = '';
    if (clsEl)  clsEl.value  = '';
}

// அனைத்து தேவையற்ற இடைவெளிகளையும் நீக்க உதவும் Function
const cleanText = (str) => { 
    if (!str) return ''; 
    return str.replace(/[\r\t\u200B-\u200D\uFEFF]/g, '').trim(); 
};

// --- கேள்வி பதிவேற்றும் முறை (Bug Fixed) ---
async function uploadSimpleText() {
    const text = document.getElementById('simple-text').value;
    const subject = document.getElementById('bulk-subject').value;
    const cls = document.getElementById('bulk-class').value;
    const statusEl = document.getElementById('paste-status');
    if (!cls || !cleanText(text)) {
        showModal({ icon: '⚠️', title: 'விவரங்கள் தேவை', msg: 'வகுப்பு மற்றும் கேள்வி உரை நிரப்பவும்!', singleBtn: true, confirmText: 'சரி' });
        return;
    }
    
    // காலி வரிகளை நீக்கி, சரியான வரிகளை மட்டும் பிரித்தெடுத்தல்
    let rawLines = text.split('\n');
    let lines = [];
    for(let l of rawLines) {
        let cl = cleanText(l);
        if(cl !== '') lines.push(cl);
    }

    if (lines.length % 6 !== 0) {
        statusEl.innerText = "❌ பிழை! ஒரு கேள்விக்கு 6 வரிகள் தேவை.";
        showModal({ icon: '❌', title: 'வரி எண்ணிக்கை பிழை', msg: 'மொத்தம் ' + lines.length + ' வரிகள் உள்ளன. ஒரு கேள்விக்கு 6 வரிகள் (கேள்வி + 4 விருப்பங்கள் + 1 விடை) இருக்க வேண்டும்.', singleBtn: true, confirmText: 'சரி' });
        return;
    }
    
    let batch = db.batch(); let validCount = 0;
    statusEl.innerText = "படிக்கப்படுகிறது... ⏳";
    
    for (let i = 0; i < lines.length; i += 6) {
        const q = lines[i], o1 = lines[i+1], o2 = lines[i+2], o3 = lines[i+3], o4 = lines[i+4];
        let ans = lines[i+5];
        
        let optionsArr = [o1, o2, o3, o4];
        let matchedAns = ans;

        // விடை ஸ்பெல்லிங்/ஸ்பேஸ் மிஸ்மேட்ச் ஆட்டோ-கரெக்ட் லாஜிக்
        if (!optionsArr.includes(ans)) {
            let found = optionsArr.find(opt => opt.toLowerCase().replace(/\s/g,'') === ans.toLowerCase().replace(/\s/g,''));
            if (found) {
                matchedAns = found; // ஆட்டோமேட்டிக் சரிசெய்தல்
            } else {
                alert(`கேள்வி ${i/6 + 1}: சரியான விடை (${ans}) நீங்கள் கொடுத்த விருப்பங்களில் இல்லை! சரிபார்த்து மீண்டும் அப்லோட் செய்யவும்.`);
                statusEl.innerText = "❌ பிழை";
                return;
            }
        }

        let docRef = db.collection("quiz_questions").doc();
        batch.set(docRef, { subject: subject, class: cls, type: 'mcq', question: q, options: [o1, o2, o3, o4], answer: matchedAns });
        validCount++;
    }
    await batch.commit();
    statusEl.innerText = "✅ " + validCount + " கேள்விகள் சேர்க்கப்பட்டன!"; statusEl.style.color = "#10b981";
    document.getElementById('simple-text').value = "";
    setTimeout(() => statusEl.innerText = "", 5000);
}

// --- நிர்வகிக்கும் பகுதி (Delete Working correctly) ---
function loadManageQuestions() {
    const subject = document.getElementById('manage-subject').value;
    const cls = document.getElementById('manage-class').value;
    const list = document.getElementById('manage-list');
    const countEl = document.getElementById('manage-q-count');
    const delAllBtn = document.getElementById('delete-all-btn');
    const qType = document.querySelector('input[name="manage-type"]:checked').value;
    const collectionName = qType === 'mcq' ? 'quiz_questions' : 'desc_questions';
    
    delAllBtn.classList.add('hidden');
    countEl.innerText = "";
    if (!subject) return; list.innerHTML = "⏳";
    
    let query = db.collection(collectionName).where("subject", "==", subject);
    if (cls) query = query.where("class", "==", cls);
    
    query.get().then(snap => {
        list.innerHTML = "";
        if (snap.empty) { list.innerHTML = "கேள்விகள் இல்லை."; return; }
        
        countEl.innerText = `மொத்தம்: ${snap.size} கேள்விகள்`;
        delAllBtn.classList.remove('hidden'); // Delete All பட்டனை காட்டு

        snap.forEach(doc => {
            let data = doc.data();
            list.innerHTML += `<div style="background:#fff; padding:15px; border:2px solid #e2e8f0; margin-bottom:10px; border-radius:10px;">
                <b>${data.question}</b><br><span style="color:green;">✅ ${data.answer}</span><br>
                <button class="danger-btn" onclick="openDeleteModal('${doc.id}', '${collectionName}', 'question')">🗑️ நீக்கு</button>
            </div>`;
        });
    });
}

function loadLeaderboard() {
    const tbody = document.getElementById('scores-body'); tbody.innerHTML = "";
    const filterSubject = document.getElementById('score-filter').value;
    let query = db.collection("quiz_scores");
    if (filterSubject) query = query.where("subject", "==", filterSubject);
    query.get().then((snapshot) => {
        snapshot.forEach(doc => {
            let data = doc.data();
            tbody.innerHTML += `<tr><td>${data.studentName}</td><td>${data.studentClass}</td><td>${data.subject}</td><td>${data.score}/${data.total}</td>
            <td><button style="background:red; color:white; border:none; border-radius:5px;" onclick="openDeleteModal('${doc.id}', 'quiz_scores', 'score')">X</button></td></tr>`;
        });
    });
}

function openDeleteModal(id, collectionName, type) { 
    itemToDelete = { id, collection: collectionName, type }; 
    document.getElementById('delete-modal').classList.remove('hidden'); 
}
function closeDeleteModal() { 
    document.getElementById('delete-modal').classList.add('hidden'); 
    itemToDelete = null; 
}

function executeDelete() {
    if (!itemToDelete) return;
    db.collection(itemToDelete.collection).doc(itemToDelete.id).delete().then(() => {
        closeDeleteModal();
        if (itemToDelete.type === 'question') loadManageQuestions(); else loadLeaderboard();
    }).catch(err => {
        alert("பிழை: " + err.message);
        closeDeleteModal();
    });
}

// --- Delete All Logic ---
async function confirmDeleteAll() {
    const subject = document.getElementById('manage-subject').value;
    const cls     = document.getElementById('manage-class').value;
    const qType   = document.querySelector('input[name="manage-type"]:checked').value;
    const collectionName = qType === 'mcq' ? 'quiz_questions' : 'desc_questions';

    if (!subject) {
        showModal({ icon: '⚠️', title: 'பாடம் தேர்வு', msg: 'முதலில் பாடத்தைத் தேர்ந்தெடுக்கவும்!', singleBtn: true, confirmText: 'சரி' });
        return;
    }

    showModal({
        icon: '🗑️',
        title: 'அனைத்தும் நீக்கவா?',
        msg: subject + ' பாடத்தின் அனைத்து கேள்விகளையும் நீக்க வேண்டுமா? மீண்டும் பெற முடியாது!',
        confirmText: 'ஆம், நீக்கு',
        cancelText: 'ரத்து',
        onConfirm: async function() {
            let query = db.collection(collectionName).where("subject", "==", subject);
            if (cls) query = query.where("class", "==", cls);
            const snap = await query.get();
            if (snap.empty) {
                showModal({ icon: 'ℹ️', title: 'கேள்விகள் இல்லை', msg: 'நீக்க கேள்விகள் ஏதும் இல்லை!', singleBtn: true, confirmText: 'சரி' });
                return;
            }
            let batch = db.batch();
            snap.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            showModal({ icon: '✅', title: 'வெற்றி!', msg: 'அனைத்து கேள்விகளும் நீக்கப்பட்டன!', singleBtn: true, confirmText: 'சரி', onConfirm: loadManageQuestions });
            loadManageQuestions();
        }
    });
}

function shuffle(arr) { let a = [...arr]; for (let i = a.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function selectQuizType(type) {
    currentActiveSubject = document.getElementById('student-subject-select').value;
    activeQuizType = type;
    var loadingEl = document.getElementById('loading');
    if (loadingEl) loadingEl.classList.remove('hidden');
    const collectionName = type === 'mcq' ? 'quiz_questions' : 'desc_questions';

    db.collection(collectionName)
      .where("subject", "==", currentActiveSubject)
      .where("class", "==", loggedInClass)
      .get().then((snap) => {
        if (loadingEl) loadingEl.classList.add('hidden');
        if (snap.empty) {
            if (loadingEl) loadingEl.classList.add('hidden');
            showModal({ icon: '📚', title: 'கேள்விகள் இல்லை', msg: 'இந்த பாடத்தில் இன்னும் கேள்விகள் வரவில்லை! ஆசிரியரிடம் கேட்கவும்.', singleBtn: true, confirmText: 'சரி' });
            return;
        }

        let allQ = [];
        snap.forEach(doc => allQ.push(doc.data()));

        // --- Difficulty filter (if docs have a 'difficulty' field) ---
        var diff = window.studentDifficulty || 'all';
        if (diff && diff !== 'all') {
            var filtered = allQ.filter(function(q){ return q.difficulty === diff; });
            // Fallback: if no questions match difficulty, use all
            if (filtered.length > 0) allQ = filtered;
        }

        // --- Mark type filter for desc questions (2mark / 5mark) ---
        if (type === 'desc') {
            var mtype = window.studentMarkType || 'all';
            if (mtype === '2mark' || mtype === '5mark') {
                var mtFiltered = allQ.filter(function(q){ return q.markType === mtype; });
                if (mtFiltered.length > 0) allQ = mtFiltered;
            }
        }

        // --- Question count from settings ---
        var qCount = window.studentQCount || 10;
        currentQuestions = (qCount === 'all') ? shuffle(allQ) : shuffle(allQ).slice(0, qCount);

        quizActive = true;
        if (type === 'mcq') startMCQQuiz(); else startDescQuiz();
    });
}

function startMCQQuiz() {
    quizActive = true;
    currentQuestionIndex = 0; score = 0; wrongCount = 0; missedCount = 0; userAnswersLog = [];
    showScreen('quiz-screen'); showMCQQuestion();
}

function showMCQQuestion() {
    document.getElementById('next-btn').classList.add('hidden');

    // Clear practice hint
    var hint = document.getElementById('practice-hint');
    if (hint) { hint.style.display = 'none'; hint.innerHTML = ''; }

    // Scroll quiz screen to top for long questions
    var qScreen = document.getElementById('quiz-screen');
    if (qScreen) qScreen.scrollTop = 0;

    const q = currentQuestions[currentQuestionIndex];

    // Progress bar
    const pctDone = Math.round((currentQuestionIndex / currentQuestions.length) * 100);
    const progBar = document.getElementById('mcq-progress');
    if (progBar) progBar.style.width = pctDone + '%';

    var qtEl = document.getElementById('question-text');
    if (qtEl) {
        qtEl.innerHTML = '<span style="color:var(--p4,#1976D2);font-size:13px;font-weight:900;display:block;margin-bottom:6px;letter-spacing:0.5px;">கேள்வி ' + (currentQuestionIndex + 1) + ' / ' + currentQuestions.length + '</span>' +
            '<span style="font-size:clamp(15px,4vw,19px);line-height:1.7;color:#0A1929;">' + q.question + '</span>';
    }

    const opts = document.getElementById('options-container'); opts.innerHTML = "";
    shuffle(q.options).forEach(opt => {
        let btn = document.createElement('button'); btn.innerText = opt; btn.className = 'option-btn';
        btn.style.textAlign = 'left';
        btn.onclick = () => checkMCQAnswer(opt, q.answer); opts.appendChild(btn);
    });

    // Timer: practice=none, exam=30s, speed=10s
    if(timerInterval) clearInterval(timerInterval);
    var tw = document.getElementById('timer-wrap');
    if (window.studentExamMode === 'practice') {
        if (tw) tw.style.display = 'none';
    } else {
        if (tw) tw.style.display = '';
        timeLeft = (window.studentExamMode === 'speed') ? 10 : 30;
        var tlEl = document.getElementById('time-left');
        if (tlEl) tlEl.innerText = timeLeft;
        // Color timer badge red when low
        timerInterval = setInterval(() => {
            timeLeft--;
            if (tlEl) tlEl.innerText = timeLeft;
            var tb = document.querySelector('.timer-badge');
            if (tb) {
                if (timeLeft <= 5) {
                    tb.style.background = 'linear-gradient(135deg,#ef4444,#f87171)';
                    tb.style.color = '#fff';
                    tb.style.animation = 'scorePulse 0.5s ease infinite';
                } else {
                    tb.style.background = '';
                    tb.style.color = '';
                    tb.style.animation = '';
                }
            }
            if (timeLeft <= 0) { clearInterval(timerInterval); checkMCQAnswer(null, q.answer); }
        }, 1000);
    }
}

function checkMCQAnswer(selected, correct) {
    clearInterval(timerInterval);
    
    let safeSelected = selected ? selected.trim() : null;
    let safeCorrect = correct ? correct.trim() : null;
    
    userAnswersLog.push({ question: currentQuestions[currentQuestionIndex].question, selected: safeSelected, correct: safeCorrect });
    
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        let btnText = btn.innerText.trim();
        if (btnText === safeCorrect) btn.classList.add('correct');
        else if (btnText === safeSelected) btn.classList.add('wrong');
    });
    
    if (safeSelected === safeCorrect) {
        score++;
        playSound('correct');
    } else if (safeSelected === null) {
        missedCount++;
        playSound('wrong');
    } else {
        wrongCount++;
        playSound('wrong');
    }
    
    document.getElementById('next-btn').classList.remove('hidden');
}

function nextQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuestions.length) showMCQQuestion();
    else showMCQResult();
}

function showMCQResult() {
    quizActive = false;
    if (timerInterval) clearInterval(timerInterval);
    const total = currentQuestions.length;
    const pct   = Math.round((score / total) * 100);

    let feedbackMsg, emoji;
    if (pct === 100)    { feedbackMsg = "Perfect! 100% சரியாக பதிலளித்தீர்கள்! 🎉"; emoji = "🥇"; }
    else if (pct >= 90) { feedbackMsg = "அருமை! சிறப்பான செயல்திறன்! 🌟"; emoji = "🥇"; }
    else if (pct >= 75) { feedbackMsg = "வாழ்த்துகள்! நல்ல முயற்சி! 👏"; emoji = "🏆"; }
    else if (pct >= 50) { feedbackMsg = "நல்லது! இன்னும் சிறப்பாக செய்யலாம்! 💪"; emoji = "👍"; }
    else if (pct >= 25) { feedbackMsg = "தொடர்ந்து பயிற்சி செய்யுங்கள்! 📖"; emoji = "📖"; }
    else                { feedbackMsg = "மேலும் கஷ்டப்படுங்கள்! நீங்கள் முடியும்! 💫"; emoji = "📚"; }

    var feedEl = document.getElementById('feedback-msg');
    var scoreEl = document.getElementById('score-text');
    var emojiEl = document.getElementById('result-emoji');
    if (feedEl)  feedEl.innerText  = feedbackMsg;
    if (scoreEl) scoreEl.innerText = "மதிப்பெண்: " + score + " / " + total + "  (" + pct + "%)";
    if (emojiEl) emojiEl.innerText = emoji;

    // Stats chips
    var statsEl = document.getElementById('result-stats');
    if (statsEl) {
        statsEl.innerHTML =
            '<div class="stat-chip"><div class="sv" style="color:#10b981">' + score + '</div><div class="sl">சரியான</div></div>' +
            '<div class="stat-chip"><div class="sv" style="color:#ef4444">' + wrongCount + '</div><div class="sl">தவறான</div></div>' +
            '<div class="stat-chip"><div class="sv" style="color:#f59e0b">' + missedCount + '</div><div class="sl">தவிர்த்தது</div></div>';
    }

    showScreen('result-screen');
    db.collection("quiz_scores").add({
        studentName: loggedInStudent, studentClass: loggedInClass, subject: currentActiveSubject,
        score: score, total: total, pct: pct,
        examMode: window.studentExamMode || 'practice',
        timestamp: new Date().toISOString()
    }).catch(function(err){ console.log('Score save error:', err); });
}

function showReviewScreen() {
    let html = "";
    userAnswersLog.forEach((log, i) => {
        let isCorrect = log.selected === log.correct;
        let color = isCorrect ? "#10b981" : "#ef4444";
        let ansText = log.selected === null ? "நேரம் முடிந்தது ⏱️" : log.selected;
        html += `<div style="background:#f8fafc; padding:15px; border-radius:15px; margin-bottom:15px; border-left: 6px solid ${color};">
            <p style="font-weight:800; color:#1e293b; margin-top:0; font-size: 15px;">${i+1}. ${log.question}</p>
            <p style="color:#64748b; font-weight:600; margin:5px 0; font-size: 14px;">உங்கள் விடை: <span style="color:${color};">${ansText}</span></p>
            ${!isCorrect ? `<p style="color:#10b981; font-weight:800; margin:5px 0; font-size: 14px;">✅ சரியான விடை: ${log.correct}</p>` : ''}
            </div>`;
    });
    document.getElementById('review-content').innerHTML = html; 
    showScreen('review-screen');
}

function startDescQuiz() { quizActive = true; currentQuestionIndex = 0; showScreen('desc-quiz-screen'); showDescQuestion(); }

function showDescQuestion() {
    // Scroll to top for long questions
    var dScreen = document.getElementById('desc-quiz-screen');
    if (dScreen) dScreen.scrollTop = 0;

    const pctDone = Math.round((currentQuestionIndex / currentQuestions.length) * 100);
    const descProg = document.getElementById('desc-progress');
    if (descProg) descProg.style.width = pctDone + '%';
    var dqEl = document.getElementById('desc-question-text');
    if (dqEl) {
        dqEl.innerHTML = '<span style="color:#FF8F00;font-size:13px;font-weight:900;display:block;margin-bottom:6px;letter-spacing:0.5px;">கேள்வி ' + (currentQuestionIndex + 1) + ' / ' + currentQuestions.length + '</span>' +
            '<span style="font-size:clamp(15px,4vw,18px);line-height:1.7;color:#0A1929;">' + currentQuestions[currentQuestionIndex].question + '</span>';
    }
    document.getElementById('desc-answer-container').style.display = 'none';
    document.getElementById('show-ans-btn').classList.remove('hidden');
    document.getElementById('desc-next-btn').classList.add('hidden');
}

function revealDescAnswer() {
    var ansEl = document.getElementById('desc-answer-container');
    var ans = currentQuestions[currentQuestionIndex].answer;
    // Format answer with clear heading
    ansEl.innerHTML = '<div style="font-size:11px;font-weight:900;color:#15803d;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">✅ சரியான விடை</div>' +
        '<div style="font-size:15px;font-weight:700;color:#14532d;line-height:1.75;">' + ans.replace(/\n/g,'<br>') + '</div>';
    ansEl.style.display = 'block';
    document.getElementById('show-ans-btn').classList.add('hidden');
    document.getElementById('desc-next-btn').classList.remove('hidden');
    // Scroll answer into view
    setTimeout(function(){ ansEl.scrollIntoView({ behavior:'smooth', block:'nearest' }); }, 100);
}

function nextDescQuestion() {
    currentQuestionIndex++;
    if (currentQuestionIndex < currentQuestions.length) showDescQuestion(); else showScreen('desc-result-screen');
}

function showCertificate() {
    document.getElementById('cert-name').innerText = loggedInStudent;
    document.getElementById('cert-subject').innerText = currentActiveSubject;
    document.getElementById('cert-score').innerText = score + " / " + currentQuestions.length;
    document.getElementById('cert-class-display').innerText = loggedInClass + " ஆம் வகுப்பு";
    let today = new Date();
    let dateStr = today.getDate() + '/' + (today.getMonth() + 1) + '/' + today.getFullYear();
    document.getElementById('cert-date').innerText = dateStr;
    showScreen('certificate-screen');
}// ============================================================
//  STUDENT-ONLY OVERRIDES  v3.0
//  உங்கள் ஆசிரியர் — Practice & Exam Mode
// ============================================================

// ── Global Settings State
window._quizMode    = 'mcq';
window._markType    = '1mark';
window._qCount      = 10;
window._difficulty  = 'all';
window._examMode    = 'practice';   // 'practice' | 'exam'

// ══════════════════════════════════════════════
//  CUSTOM MODAL ENGINE (replaces confirm/alert)
// ══════════════════════════════════════════════
var _modalCallback = null;

function showModal(opts) {
    // opts: { icon, title, msg, confirmText, cancelText, confirmClass, onConfirm, onCancel, singleBtn }
    opts = opts || {};
    document.getElementById('modal-icon').textContent    = opts.icon        || '⚠️';
    document.getElementById('modal-title').textContent   = opts.title       || 'உறுதிப்படுத்தவும்';
    document.getElementById('modal-msg').textContent     = opts.msg         || '';
    var confirmBtn = document.getElementById('modal-confirm-btn');
    var cancelBtn  = document.getElementById('modal-cancel-btn');
    confirmBtn.textContent = opts.confirmText || 'உறுதி';
    cancelBtn.textContent  = opts.cancelText  || 'ரத்து';
    confirmBtn.className   = 'modal-btn modal-btn-confirm' + (opts.confirmClass ? ' ' + opts.confirmClass : '');
    _modalCallback = opts.onConfirm || null;
    if (opts.singleBtn) {
        cancelBtn.style.display = 'none';
    } else {
        cancelBtn.style.display = '';
    }
    var overlay = document.getElementById('custom-modal');
    overlay.style.display = 'flex';
    requestAnimationFrame(function(){
        requestAnimationFrame(function(){
            overlay.classList.add('show');
        });
    });
}

function closeModal() {
    var overlay = document.getElementById('custom-modal');
    overlay.classList.remove('show');
    setTimeout(function(){ overlay.style.display = 'none'; }, 220);
    _modalCallback = null;
}

function modalConfirmAction() {
    var cb = _modalCallback;
    closeModal();
    if (cb) setTimeout(cb, 50);
}

function modalOverlayClick(e) {
    if (e.target === document.getElementById('custom-modal')) closeModal();
}

// Override browser openDeleteModal & closeDeleteModal
window.openDeleteModal = function(id, collectionName, type) {
    window._pendingDelete = { id: id, collection: collectionName, type: type };
    showModal({
        icon: '🗑️',
        title: 'நிச்சயமாக நீக்க வேண்டுமா?',
        msg: 'இந்த கேள்வியை நீக்கினால் மீண்டும் பெற முடியாது!',
        confirmText: 'ஆம், நீக்கு',
        cancelText: 'ரத்து செய்',
        onConfirm: function() {
            // Replicate executeDelete logic inline
            var item = window._pendingDelete;
            if (!item) return;
            db.collection(item.collection).doc(item.id).delete().then(function() {
                if (item.type === 'question') loadManageQuestions(); else loadLeaderboard();
            }).catch(function(err) {
                showModal({ icon: '❌', title: 'பிழை', msg: err.message, singleBtn: true, confirmText: 'சரி' });
            });
        }
    });
};
window.closeDeleteModal = function() { closeModal(); };
window.executeDelete = function() {};  // no-op, handled above

// ── goHome → always student login (NO logout)
window.goHome = function() {
    if (typeof quizActive !== 'undefined') quizActive = false;
    if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
    stopConfetti();
    document.querySelectorAll('.container').forEach(function(el){ el.classList.add('hidden'); });
    document.getElementById('student-login-screen').classList.remove('hidden');
    document.getElementById('student-name').value = '';
    document.getElementById('student-class').value = '';
};

window.studentLogout = function() { window.goHome(); };
window.checkAdminLogin    = function(){};
window.verifyTeacherLogin = function(){};

// ── Navigate to Settings screen
window.goToSettings = function() {
    var subject = document.getElementById('student-subject-select').value;
    document.getElementById('settings-subject-label').textContent = '📚 பாடம்: ' + subject;
    document.getElementById('loading').classList.add('hidden');
    showScreen('settings-screen');
};

// ── Exam Mode card selection
window.selectExamMode = function(mode) {
    window._examMode = mode;
    ['em-practice','em-exam','em-speed'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('selected','exam-sel');
    });
    var map = {'practice':'em-practice','exam':'em-exam','speed':'em-speed'};
    var el = document.getElementById(map[mode]);
    if (el) {
        el.classList.add('selected');
        if (mode !== 'practice') el.classList.add('exam-sel');
    }
};

// ── Mark type card selection
window.selectMode = function(mode, markType) {
    window._quizMode = mode;
    window._markType = markType;
    ['mc-1mark','mc-2mark','mc-5mark'].forEach(function(id){
        document.getElementById(id).classList.remove('selected');
    });
    var idMap = {'1mark':'mc-1mark','2mark':'mc-2mark','5mark':'mc-5mark'};
    document.getElementById(idMap[markType]).classList.add('selected');
};

// ── Question count pill
window.selectQCount = function(n, btn) {
    window._qCount = n;  // 'all' or number
    document.querySelectorAll('#qcount-group .pill-btn').forEach(function(b){ b.classList.remove('selected'); });
    btn.classList.add('selected');
};

// ── Difficulty pill
window.selectDiff = function(d, btn) {
    window._difficulty = d;
    document.querySelectorAll('#diff-group .pill-btn').forEach(function(b){ b.classList.remove('selected'); });
    btn.classList.add('selected');
};

// ── Start quiz — pass settings to app.js
window.startQuizWithSettings = function() {
    document.getElementById('loading').classList.remove('hidden');
    window.studentQCount     = window._qCount;
    window.studentDifficulty = window._difficulty;
    window.studentMarkType   = window._markType;
    window.studentExamMode   = window._examMode;  // 'practice' | 'exam'
    showScreen('subject-screen');
    selectQuizType(window._quizMode);
};

// ── Retry — rerun same settings
window.retryQuiz = function() {
    stopConfetti();
    window.startQuizWithSettings();
};

// ── Back button inside quiz
window.confirmQuizBack = function() {
    if (window.studentExamMode === 'exam') return;
    showModal({
        icon: '🔙',
        title: 'வெளியேற வேண்டுமா?',
        msg: 'தேர்வை இப்போது விட்டால் மதிப்பெண் கணக்கிடப்படாது.',
        confirmText: 'ஆம், வெளியேறு',
        cancelText: 'தொடரு',
        onConfirm: function() {
            if (typeof quizActive !== 'undefined') quizActive = false;
            if (typeof timerInterval !== 'undefined') clearInterval(timerInterval);
            showScreen('settings-screen');
        }
    });
};

// ── Practice-mode MCQ: intercept checkMCQAnswer to show hint
var _origCheckMCQ = null;
function _hookPracticeMode() {
    if (window.studentExamMode !== 'practice') return;

    // Hide timer
    var tw = document.getElementById('timer-wrap');
    if (tw) tw.style.display = 'none';

    // Mode label
    var ml = document.getElementById('quiz-mode-label');
    if (ml) ml.textContent = '📖 பயிற்சி mode — நேரமில்லை';

    // Hook checkMCQAnswer to add Tamil hint
    if (!_origCheckMCQ && typeof window.checkMCQAnswer === 'function') {
        _origCheckMCQ = window.checkMCQAnswer;
        window.checkMCQAnswer = function(selected, correct) {
            _origCheckMCQ(selected, correct);
            // Show hint in practice mode
            var hint = document.getElementById('practice-hint');
            if (hint) {
                if (selected === correct) {
                    hint.style.display = 'block';
                    hint.style.background = '#dcfce7';
                    hint.style.borderColor = '#86efac';
                    hint.style.color = '#166534';
                    hint.innerHTML = '✅ <strong>சரியான விடை!</strong> ' + correct;
                } else if (selected === null) {
                    hint.style.display = 'block';
                    hint.innerHTML = '⏱️ நேரம் முடிந்தது. சரியான விடை: <strong>' + correct + '</strong>';
                } else {
                    hint.style.display = 'block';
                    hint.innerHTML = '❌ தவறான விடை. சரியான விடை: <strong>' + correct + '</strong>';
                }
            }
        };
    }
}

function _resetPracticeHook() {
    if (_origCheckMCQ) {
        window.checkMCQAnswer = _origCheckMCQ;
        _origCheckMCQ = null;
    }
    var tw = document.getElementById('timer-wrap');
    if (tw) tw.style.display = '';
    var ml = document.getElementById('quiz-mode-label');
    if (ml) ml.textContent = '';
    var hint = document.getElementById('practice-hint');
    if (hint) { hint.style.display = 'none'; hint.innerHTML = ''; }
}

// ── CONFETTI
var CONF_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316'];

function launchConfetti() {
    var overlay = document.getElementById('confetti-overlay');
    overlay.style.display = 'block'; overlay.innerHTML = '';
    for (var i = 0; i < 120; i++) {
        (function(idx) {
            setTimeout(function(){
                var p = document.createElement('div'); p.className = 'conf-piece';
                var sz = (Math.random()*8+8)+'px';
                p.style.width = sz; p.style.height = (parseFloat(sz)*1.4)+'px';
                p.style.left  = (Math.random()*100)+'vw';
                p.style.background = CONF_COLORS[Math.floor(Math.random()*CONF_COLORS.length)];
                var dur = (Math.random()*2+1.5).toFixed(2)+'s';
                p.style.animationDuration = dur; p.style.animationDelay = '0s';
                overlay.appendChild(p);
                setTimeout(function(){ if(p.parentNode) p.parentNode.removeChild(p); }, parseFloat(dur)*1000+100);
            }, idx*25);
        })(i);
    }
    setTimeout(stopConfetti, 5500);
}

function stopConfetti() {
    var o = document.getElementById('confetti-overlay');
    if (o) { o.style.display='none'; o.innerHTML=''; }
}

// showScreen handled by inline script in HTML


// ══════════════════════════════════════════════
//  தவறான கேள்விகள் (Wrong Questions)
// ══════════════════════════════════════════════
function showWrongQuestions() {
    var wrongs = userAnswersLog.filter(function(l) {
        return l.selected !== l.correct;
    });
    var container = document.getElementById('wrong-questions-list');
    if (!container) return;

    if (wrongs.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
            '<div style="font-size:3rem;">🎉</div>' +
            '<p style="font-weight:800;color:#10b981;font-size:18px;margin-top:10px;">அனைத்து கேள்விகளும் சரியாக பதிலளித்தீர்கள்!</p>' +
            '</div>';
    } else {
        var html = '<div style="margin-bottom:10px;font-size:13px;font-weight:700;color:#ef4444;">' +
            wrongs.length + ' தவறான / தவிர்த்த கேள்விகள்</div>';
        wrongs.forEach(function(log, i) {
            var isMissed = log.selected === null;
            html += '<div class="wrong-q-card' + (isMissed ? ' missed' : '') + '">' +
                '<div class="wq-num">' + (isMissed ? '⏱️ நேரம் முடிந்தது' : '❌ தவறான விடை') + ' — கேள்வி ' + (i+1) + '</div>' +
                '<p class="wq-question">' + log.question + '</p>' +
                (isMissed ? '' :
                '<p class="wq-your">உங்கள் விடை: <span>' + (log.selected || '—') + '</span></p>') +
                '<p class="wq-correct">✅ சரியான விடை: <span>' + log.correct + '</span></p>' +
                '</div>';
        });
        container.innerHTML = html;
    }
    showScreen('wrong-questions-screen');
}

// Practice wrong questions again
function practiceWrongQuestions() {
    var wrongs = userAnswersLog.filter(function(l) { return l.selected !== l.correct; });
    if (wrongs.length === 0) return;
    // Build question objects from wrong log entries and match to currentQuestions
    var wrongQs = [];
    wrongs.forEach(function(log) {
        var match = currentQuestions.find(function(q) { return q.question === log.question; });
        if (match) wrongQs.push(match);
    });
    if (wrongQs.length === 0) return;
    currentQuestions = wrongQs;
    currentQuestionIndex = 0;
    score = 0; wrongCount = 0; missedCount = 0; userAnswersLog = [];
    quizActive = true;
    startMCQQuiz();
}

// ══════════════════════════════════════════════
//  Analysis Screen
// ══════════════════════════════════════════════
function showAnalysis() {
    var container = document.getElementById('analysis-content');
    if (!container) return;

    var total   = currentQuestions.length;
    var pct     = total > 0 ? Math.round((score / total) * 100) : 0;
    var wrongPct= total > 0 ? Math.round((wrongCount / total) * 100) : 0;
    var missedPct=total > 0 ? Math.round((missedCount/ total) * 100) : 0;

    // Grade
    var grade, gradeColor;
    if (pct >= 90) { grade='A+'; gradeColor='#10b981'; }
    else if (pct >= 80) { grade='A'; gradeColor='#10b981'; }
    else if (pct >= 70) { grade='B+'; gradeColor='#3b82f6'; }
    else if (pct >= 60) { grade='B'; gradeColor='#3b82f6'; }
    else if (pct >= 50) { grade='C'; gradeColor='#f59e0b'; }
    else { grade='D'; gradeColor='#ef4444'; }

    var subject = currentActiveSubject || '—';
    var mode    = window.studentExamMode === 'exam' ? '🏆 தேர்வு' : '📖 பயிற்சி';

    var html =
    // ── Big stats grid
    '<div class="analysis-grid">' +
        '<div class="mini-stat"><div class="ms-val" style="color:' + gradeColor + '">' + grade + '</div><div class="ms-label">தரம் (Grade)</div></div>' +
        '<div class="mini-stat"><div class="ms-val" style="color:#3b82f6">' + pct + '%</div><div class="ms-label">சதவீதம்</div></div>' +
        '<div class="mini-stat"><div class="ms-val" style="color:#10b981">' + score + '</div><div class="ms-label">சரியான</div></div>' +
        '<div class="mini-stat"><div class="ms-val" style="color:#ef4444">' + wrongCount + '</div><div class="ms-label">தவறான</div></div>' +
    '</div>' +

    // ── Donut chart (SVG)
    '<div class="analysis-card">' +
        '<h4>📈 விடை பகுப்பு</h4>' +
        '<div class="donut-wrap">' +
            _buildDonut(pct, wrongPct, missedPct) +
            '<div class="donut-legend">' +
                '<div class="legend-item"><div class="legend-dot" style="background:#10b981"></div>சரியான: ' + score + ' (' + pct + '%)</div>' +
                '<div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>தவறான: ' + wrongCount + ' (' + wrongPct + '%)</div>' +
                '<div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div>தவிர்த்தது: ' + missedCount + ' (' + missedPct + '%)</div>' +
            '</div>' +
        '</div>' +
    '</div>' +

    // ── Score bar
    '<div class="analysis-card">' +
        '<h4>🎯 மதிப்பெண் அளவீடு</h4>' +
        _buildBar('சரியான', pct, '#10b981') +
        _buildBar('தவறான', wrongPct, '#ef4444') +
        _buildBar('தவிர்த்தது', missedPct, '#f59e0b') +
    '</div>' +

    // ── Session info
    '<div class="analysis-card">' +
        '<h4>📋 தேர்வு விவரம்</h4>' +
        '<div style="font-size:14px;font-weight:700;color:#475569;line-height:2;">' +
            '📚 பாடம்: <strong style="color:#1e293b">' + subject + '</strong><br>' +
            '🎭 வகை: <strong style="color:#1e293b">' + mode + '</strong><br>' +
            '🔢 மொத்த கேள்விகள்: <strong style="color:#1e293b">' + total + '</strong><br>' +
            '⏱️ நேர அட்டவணை: <strong style="color:#1e293b">' + (window.studentExamMode==='exam' ? '30 வி/கேள்வி' : 'இல்லை') + '</strong>' +
        '</div>' +
    '</div>' +

    // ── Firebase history (loaded async below)
    '<div class="analysis-card" id="history-card">' +
        '<h4>🕐 முந்தைய மதிப்பெண்கள்</h4>' +
        '<div id="history-list" style="color:#94a3b8;font-weight:700;font-size:13px;">ஏற்றுகிறது... ⏳</div>' +
    '</div>';

    container.innerHTML = html;
    showScreen('analysis-screen');

    // Load history from Firebase async
    _loadScoreHistory();
}

function _buildDonut(pct, wrongPct, missedPct) {
    var r = 44, cx = 54, cy = 54, circ = 2 * Math.PI * r;
    function arc(val, offset, color) {
        var dash = (val / 100) * circ;
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color +
            '" stroke-width="14" stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) +
            '" stroke-dashoffset="-' + offset.toFixed(1) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
    }
    var off1 = 0;
    var off2 = -(pct / 100) * circ;
    var off3 = -((pct + wrongPct) / 100) * circ;
    return '<svg class="donut-svg" width="108" height="108" viewBox="0 0 108 108">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#f1f5f9" stroke-width="14"/>' +
        arc(pct, off1, '#10b981') +
        arc(wrongPct, off2, '#ef4444') +
        arc(missedPct, off3, '#f59e0b') +
        '<text x="' + cx + '" y="' + (cy+5) + '" text-anchor="middle" font-size="16" font-weight="900" fill="#1e293b">' + pct + '%</text>' +
    '</svg>';
}

function _buildBar(label, pct, color) {
    return '<div class="score-bar-wrap">' +
        '<div class="score-bar-label"><span>' + label + '</span><span>' + pct + '%</span></div>' +
        '<div class="score-bar-bg"><div class="score-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
    '</div>';
}

function _loadScoreHistory() {
    if (typeof db === 'undefined') return;
    var histList = document.getElementById('history-list');
    if (!histList) return;
    db.collection('quiz_scores')
      .where('studentName', '==', loggedInStudent)
      .where('studentClass', '==', loggedInClass)
      .get().then(function(snap) {
        if (snap.empty) { histList.innerHTML = '<span style="color:#94a3b8;">இன்னும் மதிப்பெண்கள் இல்லை</span>'; return; }
        var rows = [];
        snap.forEach(function(doc) { rows.push(doc.data()); });
        // Sort by timestamp desc, take last 8
        rows.sort(function(a,b) { return (b.timestamp||'') > (a.timestamp||'') ? 1 : -1; });
        rows = rows.slice(0, 8);
        var h = '';
        rows.forEach(function(r) {
            var d = r.timestamp ? r.timestamp.substring(0,10) : '—';
            var p = r.total > 0 ? Math.round((r.score/r.total)*100) : 0;
            var c = p>=70 ? '#10b981' : p>=50 ? '#f59e0b' : '#ef4444';
            h += '<div class="history-row">' +
                '<span class="hr-date">' + d + '</span>' +
                '<span class="hr-subj">' + (r.subject||'—') + '</span>' +
                '<span class="hr-score" style="color:' + c + '">' + r.score + '/' + r.total + ' (' + p + '%)</span>' +
                '</div>';
        });
        histList.innerHTML = h;
    }).catch(function() {
        histList.innerHTML = '<span style="color:#94a3b8;">ஏற்ற முடியவில்லை</span>';
    });
}

// ══════════════════════════════════════════════
//  Clear Settings
// ══════════════════════════════════════════════
function clearSettings() {
    // Reset exam mode
    window._examMode   = 'practice';
    window._quizMode   = 'mcq';
    window._markType   = '1mark';
    window._qCount     = 10;
    window._difficulty = 'all';

    // Reset exam mode cards
    var pCard = document.getElementById('em-practice');
    var eCard = document.getElementById('em-exam');
    if (pCard) { pCard.classList.add('selected'); pCard.classList.remove('exam-sel'); }
    if (eCard) { eCard.classList.remove('selected','exam-sel'); }

    // Reset mark type cards
    ['mc-1mark','mc-2mark','mc-5mark'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('selected');
    });
    var m1 = document.getElementById('mc-1mark');
    if (m1) m1.classList.add('selected');

    // Reset qcount pills
    document.querySelectorAll('#qcount-group .pill-btn').forEach(function(b) {
        b.classList.remove('selected');
        if (b.textContent.trim() === '10') b.classList.add('selected');
    });

    // Reset difficulty pills
    document.querySelectorAll('#diff-group .pill-btn').forEach(function(b) {
        b.classList.remove('selected');
        if (b.textContent.includes('அனைத்தும')) b.classList.add('selected');
    });

    showModal({ icon:'✅', title:'மீட்டமைக்கப்பட்டது', msg:'அனைத்து அமைப்புகளும் இயல்பு நிலைக்கு மீட்டமைக்கப்பட்டன.', singleBtn:true, confirmText:'சரி' });
}


// ══════════════════════════════════════════
//  Share Score
// ══════════════════════════════════════════
function shareScore() {
    var total  = currentQuestions.length;
    var pct    = total > 0 ? Math.round((score/total)*100) : 0;
    var emoji  = pct>=90?'🥇':pct>=70?'🏆':pct>=50?'👍':'📚';
    var text   = emoji + ' உங்கள் ஆசிரியர் - வினாடி வினா\n' +
        '📚 பாடம்: ' + (currentActiveSubject||'') + '\n' +
        '🎯 மதிப்பெண்: ' + score + '/' + total + ' (' + pct + '%)\n' +
        '👤 ' + (loggedInStudent||'') + ' · ' + (loggedInClass||'') + ' வகுப்பு\n' +
        '✨ ungal-aasiriyar.app';

    if (navigator.share) {
        navigator.share({ title: 'உங்கள் ஆசிரியர்', text: text })
            .catch(function(){});
    } else {
        // Fallback: copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(function(){
                showModal({ icon:'📋', title:'Copied!',
                    msg:'Score clipboard-ல் copy ஆனது. Paste செய்து share செய்யலாம்!',
                    singleBtn:true, confirmText:'சரி' });
            });
        } else {
            showModal({ icon:'📤', title:'உங்கள் Score',
                msg: score + '/' + total + ' (' + pct + '%) - ' + (currentActiveSubject||''),
                singleBtn:true, confirmText:'சரி' });
        }
    }
}

// ══════════════════════════════════════════
//  Dark Mode Toggle
// ══════════════════════════════════════════
function toggleDarkMode() {
    var body = document.body;
    var btn  = document.getElementById('dark-btn');
    if (body.classList.contains('dark-mode')) {
        body.classList.remove('dark-mode');
        if (btn) btn.textContent = '🌙';
        localStorage.setItem('darkMode','0');
    } else {
        body.classList.add('dark-mode');
        if (btn) btn.textContent = '☀️';
        localStorage.setItem('darkMode','1');
    }
}

// Apply saved dark mode on load
(function(){
    if (localStorage.getItem('darkMode') === '1') {
        document.body.classList.add('dark-mode');
        var btn = document.getElementById('dark-btn');
        if (btn) btn.textContent = '☀️';
    }
})();

// ═══════════════════════════════════════════════════
//  UPGRADE v4 — Notifications · Progress · Share · Speed · Dark
// ═══════════════════════════════════════════════════

// ── TOAST NOTIFICATION
function showToast(msg, duration) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function(){ t.classList.remove('show'); }, duration||2800);
}

// ── DARK MODE
function toggleDark() {
    var body = document.body;
    var btn  = document.getElementById('dark-btn');
    var isDark = body.classList.toggle('dark');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('ua_dark', isDark ? '1' : '0');
}
(function applyDark(){
    if (localStorage.getItem('ua_dark') === '1') {
        document.body.classList.add('dark');
        var b = document.getElementById('dark-btn');
        if (b) b.textContent = '☀️';
    }
})();

// ── NOTIFICATIONS (browser push)
function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(function(p){
            if (p === 'granted') {
                showToast('🔔 Notifications enabled!');
                scheduleStudyReminder();
            }
        });
    }
}
function scheduleStudyReminder() {
    // Show reminder if user hasn't studied today
    var last = localStorage.getItem('ua_last_study');
    var today = new Date().toDateString();
    if (last !== today && Notification.permission === 'granted') {
        setTimeout(function(){
            new Notification('உங்கள் ஆசிரியர் 📚', {
                body: 'இன்று படிக்கவில்லையா? வாருங்கள்!',
                icon: '20260315_085358.png'
            });
        }, 5000);
    }
}
function markStudiedToday() {
    localStorage.setItem('ua_last_study', new Date().toDateString());
}

// ── SHARE SCORE
function shareScore() {
    var total = currentQuestions ? currentQuestions.length : 0;
    var pct   = total > 0 ? Math.round((score/total)*100) : 0;
    var e     = pct>=90?'🥇':pct>=70?'🏆':pct>=50?'👍':'📚';
    var text  = e + ' உங்கள் ஆசிரியர் Quiz Result\n' +
        '📚 ' + (currentActiveSubject||'') + '\n' +
        '🎯 ' + score + '/' + total + ' (' + pct + '%)\n' +
        '👤 ' + (loggedInStudent||'') + ' · ' + (loggedInClass||'') + '\n' +
        '#UngalAasiriyar #TamilQuiz';
    if (navigator.share) {
        navigator.share({title:'உங்கள் ஆசிரியர்', text:text}).catch(function(){});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function(){
            showToast('📋 Score copied! Paste செய்து share செய்யுங்கள்');
        });
    } else {
        showModal({icon:'📤',title:'Share',msg:text,singleBtn:true,confirmText:'சரி'});
    }
}

// ── PROGRESS TRACKING
function showProgressScreen() {
    var el = document.getElementById('progress-student-name');
    if (el) el.textContent = (loggedInStudent||'') + ' · ' + (loggedInClass||'') + ' வகுப்பு';
    var content = document.getElementById('progress-content');
    if (!content) { showScreen('progress-screen'); return; }
    content.innerHTML = '<div style="text-align:center;padding:20px;color:var(--sub);font-weight:700;">⏳ ஏற்றுகிறது...</div>';
    showScreen('progress-screen');

    if (typeof db === 'undefined') { content.innerHTML = '<p style="color:var(--sub);text-align:center;">Firebase இணைப்பு இல்லை</p>'; return; }

    db.collection('quiz_scores')
      .where('studentName','==',loggedInStudent)
      .where('studentClass','==',loggedInClass)
      .get().then(function(snap) {
        if (snap.empty) {
            content.innerHTML = '<div style="text-align:center;padding:40px;color:var(--sub);font-weight:700;">📚 இன்னும் தேர்வுகள் எழுதவில்லை!</div>';
            return;
        }
        var rows = []; snap.forEach(function(d){ rows.push(d.data()); });
        rows.sort(function(a,b){ return (b.timestamp||'')>(a.timestamp||'')?1:-1; });

        // Overall stats
        var total   = rows.length;
        var avgPct  = Math.round(rows.reduce(function(s,r){ return s + (r.total>0?r.score/r.total:0); },0)/total*100);
        var best    = Math.max.apply(null, rows.map(function(r){ return r.total>0?Math.round(r.score/r.total*100):0; }));
        var streak  = _calcStreak(rows);

        // Per-subject breakdown
        var subjects = {};
        rows.forEach(function(r){
            var s = r.subject||'Unknown';
            if (!subjects[s]) subjects[s] = {total:0,sum:0,count:0};
            subjects[s].count++;
            subjects[s].sum += (r.total>0?r.score/r.total*100:0);
        });

        var html = '';
        // Summary card
        html += '<div class="progress-screen-card">';
        html += '<div style="font-size:11px;font-weight:900;color:var(--p3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">📊 மொத்த செயல்திறன்</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">';
        html += _pCard('🎯','மொத்தம்',total,'தேர்வுகள்','#1976D2');
        html += _pCard('📈','சராசரி',avgPct+'%','score','#16a34a');
        html += _pCard('🏆','சிறந்தது',best+'%','record','#FFB300');
        html += '</div>';
        html += '<div style="margin-top:12px;padding:10px 14px;background:linear-gradient(135deg,var(--p2),var(--p4));border-radius:14px;display:flex;align-items:center;gap:10px;">';
        html += '<span style="font-size:22px;">' + (streak>=7?'🔥':streak>=3?'⭐':'🌱') + '</span>';
        html += '<div><div style="color:#fff;font-size:14px;font-weight:900;">' + streak + ' நாள் தொடர்ச்சி</div>';
        html += '<div style="color:rgba(255,255,255,0.75);font-size:11px;font-weight:700;">Study Streak</div></div>';
        html += '</div>';
        html += '</div>';

        // Subject-wise
        html += '<div class="progress-screen-card">';
        html += '<div style="font-size:11px;font-weight:900;color:var(--p3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">📚 பாடம் வாரியாக</div>';
        Object.keys(subjects).forEach(function(s){
            var avg = Math.round(subjects[s].sum / subjects[s].count);
            var col = avg>=70?'#16a34a':avg>=50?'#f59e0b':'#ef4444';
            html += '<div class="progress-subject-bar">';
            html += '<div class="psb-label"><span>' + s + '</span><span style="color:'+col+';font-weight:900;">' + avg + '%</span></div>';
            html += '<div class="psb-track"><div class="psb-fill" style="width:'+avg+'%;background:linear-gradient(90deg,'+col+','+col+'aa);"></div></div>';
            html += '<div style="font-size:11px;color:var(--sub);margin-top:2px;">' + subjects[s].count + ' தேர்வுகள்</div>';
            html += '</div>';
        });
        html += '</div>';

        // Recent history
        html += '<div class="progress-screen-card">';
        html += '<div style="font-size:11px;font-weight:900;color:var(--p3);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">🕐 கடைசி 8 தேர்வுகள்</div>';
        rows.slice(0,8).forEach(function(r){
            var p = r.total>0?Math.round(r.score/r.total*100):0;
            var c = p>=70?'#16a34a':p>=50?'#f59e0b':'#ef4444';
            var d = r.timestamp ? r.timestamp.substring(0,10) : '—';
            html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--bdr);">';
            html += '<div style="font-size:11px;color:var(--sub);min-width:65px;">' + d + '</div>';
            html += '<div style="flex:1;font-size:13px;font-weight:800;color:var(--text);">' + (r.subject||'—') + '</div>';
            html += '<div style="font-size:14px;font-weight:900;color:'+c+';">' + r.score + '/' + r.total + ' <span style="font-size:11px;">('+p+'%)</span></div>';
            html += '</div>';
        });
        html += '</div>';

        content.innerHTML = html;
    }).catch(function(e){
        content.innerHTML = '<p style="color:var(--sub);text-align:center;">Error: ' + e.message + '</p>';
    });
}
function _pCard(icon,label,val,sub,color) {
    return '<div style="background:var(--bg);border-radius:14px;padding:12px 8px;text-align:center;border:1.5px solid var(--bdr);">' +
        '<div style="font-size:1.5rem;">' + icon + '</div>' +
        '<div style="font-size:18px;font-weight:900;color:'+color+';">' + val + '</div>' +
        '<div style="font-size:10px;font-weight:800;color:var(--sub);margin-top:2px;">' + label + '</div>' +
        '</div>';
}
function _calcStreak(rows) {
    var dates = [...new Set(rows.map(function(r){ return r.timestamp?(r.timestamp.substring(0,10)):''; }).filter(Boolean))].sort().reverse();
    if (!dates.length) return 0;
    var streak = 0; var today = new Date();
    for (var i=0;i<dates.length;i++) {
        var d = new Date(dates[i]);
        var diff = Math.round((today - d)/(1000*60*60*24));
        if (diff === i) streak++; else break;
    }
    return streak;
}

// ── SPEED MODE timer integration
window._origStartMCQ = window.startMCQQuiz;
// Speed mode handled in showMCQQuestion via window.studentExamMode === 'speed'

// ── AUTO-REQUEST NOTIFICATION after first quiz
var _notifRequested = false;
var _origShowMCQResult = window.showMCQResult;

// Hook into result to trigger notification request + study tracking
var _afterResult = function() {
    markStudiedToday();
    if (!_notifRequested) {
        _notifRequested = true;
        setTimeout(requestNotificationPermission, 2000);
    }
};
// Override showMCQResult to add hooks
var _baseShowMCQResult = showMCQResult;
window.showMCQResult = _baseShowMCQResult; // keep existing

// ── HAPTIC FEEDBACK


// ── selectExamMode — include speed
window.selectExamMode = function(mode) {
    window._examMode = mode;
    ['em-practice','em-exam','em-speed'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) { el.classList.remove('selected','exam-sel'); }
    });
    var map = {practice:'em-practice',exam:'em-exam',speed:'em-speed'};
    var el = document.getElementById(map[mode]||'em-practice');
    if (el) { el.classList.add('selected'); if (mode!=='practice') el.classList.add('exam-sel'); }
};

// ── Progress screen navigation
window.showProgressScreen = showProgressScreen;
