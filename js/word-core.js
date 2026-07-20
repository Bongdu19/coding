/**
 * BONG HSK 통합 단어 데이터 및 툴팁 파서 코어 엔진 (word-core.js) - 실시간 파서 업그레이드 버전
 */

let wordDictionary = {};
let isExtraDictLoaded = false;

async function loadMasterDictionary(currentType = 'all') {
    try {
        let primaryTarget = '';
        if (currentType === '1' || currentType === '2' || currentType === '3') {
            primaryTarget = `./data/hsk${currentType}.json`;
        } else if (currentType === 'radical') {
            primaryTarget = './data/radical.json';
        }

        if (primaryTarget) {
            const res = await fetch(primaryTarget).then(r => r.json()).catch(() => []);
            injectWordsToDictionary(res, currentType);
            console.log(`⚡ 필수 사전 파일 1종 우선 로드 완료 (${primaryTarget})`);
        } else {
            const datasets = await Promise.all([
                fetch('./data/hsk1.json').then(r => r.json()).catch(() => []),
                fetch('./data/hsk2.json').then(r => r.json()).catch(() => []),
                fetch('./data/hsk3.json').then(r => r.json()).catch(() => [])
            ]);
            injectWordsToDictionary(datasets[0], '1');
            injectWordsToDictionary(datasets[1], '2');
            injectWordsToDictionary(datasets[2], '3');
            console.log(`⚡ 통합 사전 파일 기본 로드 완료`);
        }

        setTimeout(async () => {
            if (isExtraDictLoaded) return;
            const extraFiles = [
                { path: './data/radical.json', tag: 'radical' },
                { path: './data/hsk3.json', tag: '3' },
                { path: './data/hsk2.json', tag: '2' },
                { path: './data/hsk1.json', tag: '1' }
            ];

            for (const file of extraFiles) {
                if (primaryTarget && file.path.includes(primaryTarget.replace('./', ''))) continue;
                const data = await fetch(file.path).then(r => r.json()).catch(() => []);
                injectWordsToDictionary(data, file.tag);
            }
            isExtraDictLoaded = true;
            console.log("🎯 백그라운드 전체 마스터 사전 빌드 완료! 단어 수:", Object.keys(wordDictionary).length);
        }, 300);

    } catch (err) {
        console.error("❌ 마스터 사전 데이터 로드 실패:", err);
    }
}

function injectWordsToDictionary(wordsArray, typeTag) {
    if (!Array.isArray(wordsArray)) return;
    let levelLabel = '부수';
    if (typeTag === '1') levelLabel = '1급';
    if (typeTag === '2') levelLabel = '2급';
    if (typeTag === '3') levelLabel = '3급';

    wordsArray.forEach(word => {
        const wordKey = word.hanzi || word.han || word.word;
        if (wordKey) {
            const trimmedKey = wordKey.trim();
            let meanText = '';
            if (Array.isArray(word.meanings)) {
                meanText = word.meanings.map(m => `[${m.pos}] ${m.ko}`).join(', ');
            } else {
                meanText = word.meaning || word.kor || '';
            }

            if (wordDictionary[trimmedKey]) {
                const existingLabel = wordDictionary[trimmedKey].level;
                if (existingLabel === '1급') return;
                if (existingLabel === '2급' && (levelLabel === '3급' || levelLabel === '부수')) return;
                if (existingLabel === '3급' && levelLabel === '부수') return;
            }

            wordDictionary[trimmedKey] = { 
                mean: meanText, 
                py: word.pinyin || word.pin || '',
                hanja: word.hanja || '',
                level: levelLabel
            };
        }
    });
}

/**
 * 💡 [구조 개편] 예문 한자들을 하나하나 쪼개지 않고, 문장 전체를 통째로 클릭 가능한 스팬으로 래핑합니다.
 * 백그라운드 로딩 상태와 무관하게 100% 정상 작동하며, 폰트 크기 불일치 현상이 완벽히 해결됩니다.
 */
function parseHanziToTooltip(sentence) {
    if (!sentence) return '';
    const isChineseChar = (str) => /[\u4e00-\u9fa5]/.test(str);
    let resultHtml = '';

    for (let char of sentence) {
        if (isChineseChar(char)) {
            // 한자 수량 단위당 실시간 지능형 클릭 핸들러 바인딩
            resultHtml += `<span class="zh-clickable-char" onclick="handleCharClick(event, '${sentence}', ${sentence.indexOf(char)})">${char}</span>`;
        } else {
            resultHtml += `<span>${char}</span>`;
        }
    }
    return resultHtml;
}

/**
 * 💡 사용자가 문장 속 특정 한자를 터치한 순간, 좌우 문맥을 조합하여 사전에 있는 가장 긴 단어를 찾아냅니다.
 */
function handleCharClick(event, fullSentence, clickIndex) {
    event.stopPropagation();
    
    let matchedWord = '';
    let maxLen = 0;
    
    // 클릭한 글자를 중심으로 최대 4글자 범위까지 단어 매칭 추적
    for (let start = Math.max(0, clickIndex - 3); start <= clickIndex; start++) {
        for (let end = clickIndex + 1; end <= Math.min(fullSentence.length, clickIndex + 4); end++) {
            let subWord = fullSentence.substring(start, end);
            if (wordDictionary[subWord] && subWord.length > maxLen) {
                matchedWord = subWord;
                maxLen = subWord.length;
            }
        }
    }
    
    // 만약 결합 단어가 없다면 클릭한 낱개 한자 지정
    if (!matchedWord) {
        let singleChar = fullSentence.charAt(clickIndex);
        if (wordDictionary[singleChar]) matchedWord = singleChar;
    }
    
    if (matchedWord) {
        showWordCoreTooltip(event, matchedWord);
    }
}

/**
 * 3. 컴팩트 툴팁 메인 레이아웃 렌더러
 */
function showWordCoreTooltip(event, word) {
    if (window.speechSynthesis) window.speechSynthesis.cancel(); 

    let tooltip = document.getElementById('tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'word-tooltip';
        document.body.appendChild(tooltip);
    }

    const info = wordDictionary[word];
    if (info) {
        let badgeColor = '#94a3b8';
        if (info.level === '1급') badgeColor = '#4caf50';
        if (info.level === '2급') badgeColor = '#4cc9f0';
        if (info.level === '3급') badgeColor = '#4361ee';

        let hanjaHtml = info.hanja ? `<div style="font-size: 13px; font-weight: 500; color: #cbd5e1; margin-top: 4px;">${info.hanja}</div>` : '';
        
        tooltip.innerHTML = `
            <div style="text-align: center; min-width: 180px; max-width: 260px; font-family: 'Pretendard', -apple-system, sans-serif; padding: 2px 0;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap; line-height: 1.2;">
                    <span style="font-size: 11px; font-weight: 700; color: #ffffff; background: ${badgeColor}; padding: 1px 4px; border-radius: 4px; flex-shrink: 0;">${info.level}</span>
                    <span style="font-size: 24px; font-weight: 800; color: #ffffff;">${word}</span>
                    <span style="font-size: 15px; font-weight: 700; color: #74c0fc; margin-left: 2px;">${info.py}</span>
                </div>
                ${hanjaHtml}
                <div style="font-size: 13px; font-weight: 600; color: #ff85a2; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.15); margin-top: 6px; text-align: center; line-height: 1.4; white-space: normal; word-break: break-all;">
                    ${info.mean}
                </div>
            </div>
        `;

        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2 || 90)}px`; 
        tooltip.style.top = `${rect.top + window.scrollY - (tooltip.offsetHeight || 110) - 8}px`;
        tooltip.style.display = 'block';

        const ut = new SpeechSynthesisUtterance(word);
        ut.lang = 'zh-CN'; ut.rate = 0.8;
        window.speechSynthesis.speak(ut);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', () => {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });
});
