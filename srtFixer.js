document.getElementById('fileInput').addEventListener('change', function() {
    document.getElementById('processBtn').disabled = !this.files.length;
});

document.getElementById('processBtn').addEventListener('click', function() {
    const file = document.getElementById('fileInput').files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const processedContent = processSRT(content);
        downloadFile(processedContent, file.name.replace('.srt', '_fixed.srt'));
    };
    reader.readAsText(file);
});

// --- 핵심 처리 로직 ---
function processSRT(text) {
    const pattern = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})\n((?:(?!\n\n)[\s\S])*)/g;
    let matches = [...text.matchAll(pattern)];
    let parsedSubs = matches.map(m => ({ start: m[2], end: m[3], text: m[4].replace(/\n/g, ' ').trim() }));

    let splitSubs = [];
    
    // 1단계: 문맥 기반 분할
    parsedSubs.forEach(sub => {
        let currentText = sub.text;
        let currentStartMs = timeToMs(sub.start);
        let totalDuration = timeToMs(sub.end) - currentStartMs;
        let totalLength = currentText.length;

        while (currentText.length > 30) {
            let splitIdx = findBestSplitIndex(currentText, 24, 30);
            if (splitIdx === -1) break;

            let part1 = currentText.substring(0, splitIdx).trim();
            currentText = currentText.substring(splitIdx).trim();

            let part1Duration = Math.floor(totalDuration * (part1.length / totalLength));
            let part1EndMs = currentStartMs + part1Duration;

            splitSubs.push({ start: msToTime(currentStartMs), end: msToTime(part1EndMs), text: part1 });
            currentStartMs = part1EndMs;
        }
        if (currentText) {
            splitSubs.push({ start: msToTime(currentStartMs), end: sub.end, text: currentText });
        }
    });

    // 2단계: 타임코드 후방 연결 (앞 자막의 끝 시간을 뒷 자막의 시작 시간에 맞춤)
    for (let i = 0; i < splitSubs.length - 1; i++) {
        splitSubs[i].end = splitSubs[i+1].start;
    }

    // 3단계: 문장 끝 마침표(.) 제거 및 SRT 텍스트로 재조립
    return splitSubs.map((sub, i) => {
        let finalText = sub.text;
        // 텍스트의 맨 끝이 마침표('.')로 끝나면 제거
        if (finalText.endsWith('.')) {
            finalText = finalText.slice(0, -1);
        }
        return `${i + 1}\n${sub.start} --> ${sub.end}\n${finalText}`;
    }).join('\n\n');
}

// --- 유틸리티 함수 ---
function timeToMs(timeStr) {
    let parts = timeStr.split(':');
    let s_ms = parts[2].split(',');
    return parseInt(parts[0]) * 3600000 + parseInt(parts[1]) * 60000 + parseInt(s_ms[0]) * 1000 + parseInt(s_ms[1]);
}

function msToTime(ms) {
    let h = Math.floor(ms / 3600000); ms %= 3600000;
    let m = Math.floor(ms / 60000); ms %= 60000;
    let s = Math.floor(ms / 1000); ms %= 1000;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
}

function findBestSplitIndex(text, target, maxLen) {
    let minPenalty = Infinity;
    let bestSpace = -1;
    
    for (let i = 10; i <= target + 8 && i < text.length; i++) {
        if (text[i] !== ' ') continue;
        
        let penalty = Math.abs(i - target);
        let prevChar = text[i - 1];
        let prev2Chars = i >= 2 ? text.substring(i - 2, i) : "";

        if (['.', ',', '?', '!'].includes(prevChar)) penalty -= 10;
        else if (['는데', '니까', '면서', '지만', '어서', '아서'].includes(prev2Chars)) penalty -= 8;
        else if (['요', '다', '까', '죠', '고', '면', '서', '네', '은', '는', '이', '가', '을', '를'].includes(prevChar)) penalty -= 5;

        if (penalty < minPenalty) {
            minPenalty = penalty;
            bestSpace = i;
        }
    }
    return bestSpace !== -1 ? bestSpace : text.substring(0, target).lastIndexOf(' ');
}

function downloadFile(content, fileName) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
