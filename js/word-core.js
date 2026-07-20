/**
 * BONG HSK 통합 단어 데이터 및 툴팁 파서 코어 엔진 (word-core.js) - 컴팩트 디자인 및 급수 뱃지 반영 버전
 */

// 글로벌 공유 마스터 사전
let wordDictionary = {};
// 백그라운드 지연 로드 완료 여부 플래그
let isExtraDictLoaded = false;

/**
 * 1. 기초 JSON 단어 파일들을 비동기 로드하여 마스터 사전에 적재
 */
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
                fetch('./data/hsk2.json').then(res => res.json()).catch(() => []),
                fetch('./data/hsk3.json').then(res => res.json()).catch(() => [])
            ]);
            injectWordsToDictionary(datasets[0], '1');
            injectWordsToDictionary(datasets[1], '2');
            injectWordsToDictionary(datasets[2], '3');
            console.log(`⚡ 통합 사전 파일 기본 로드 완료`);
        }

        // 백그라운드 지연 로드 (나머지 급수 파일 수집)
        setTimeout(async () => {
            if (isExtraDictLoaded) return;
            
            // 💡 우선순위(1급 -> 2급 -> 3급 -> 부수)가 덮어쓰기 과정에서 보존되도록 역순(부수부터)으로 로드 처리합니다.
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

/**
 * 사전에 데이터를 적재하며 우선순위에 의거한 레벨 태그를 마킹합니다.
 */
function injectWordsToDictionary(wordsArray, typeTag) {
    if (!Array.isArray(wordsArray)) return;

    // 내부 등급 문자열 치환
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

            // 💡 [우선순위 로직]: 기존에 이미 1급, 2급 같은 높은 우선순위 등급 정보가 채워져 있다면 덮어쓰지 않고 보호합니다.
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
 * 중국어 문장 문자열을 툴팁 HTML 형태로 치환
 */
function parseHanziToTooltip(sentence) {
    if (!sentence) return '';
    let tempResult = sentence;
    
    const sortedKeys = Object.keys(wordDictionary).sort((a, b) => b.length - a.length);
    const replacementMap = {};
    let uniqueId = 0;
    const isChineseChar = (str) => /[\u4e00-\u9fa5]/.test(str);

    sortedKeys.forEach(word => {
        if (tempResult.includes(word) && isChineseChar(word)) {
            const placeholder = `__BONG_CORE_FLAG_${uniqueId}__`;
            replacementMap[placeholder] = `<span class="zh-word" onclick="showWordCoreTooltip(event, '${word}');">${word}</span>`;
            tempResult = tempResult.split(word).join(placeholder);
            uniqueId++;
        }
    });

    let outputHtml = '';
    let tokens = tempResult.split(/(__BONG_CORE_FLAG_\d+__)/);

    tokens.forEach(token => {
        if (token.startsWith('__BONG_CORE_FLAG_')) {
            outputHtml += token;
        } else {
            for (let char of token) {
                if (isChineseChar(char) && wordDictionary[char]) {
                    outputHtml += `<span class="zh-word" onclick="showWordCoreTooltip(event, '${char}');">${char}</span>`;
                } else {
                    outputHtml += `<span class="non-zh-text">${char}</span>`;
                }
            }
        }
    });

    Object.keys(replacementMap).forEach(placeholder => {
        outputHtml = outputHtml.split(placeholder).join(replacementMap[placeholder]);
    });

    return outputHtml;
}

/**
 * 컴팩트해진 전용 디자인 툴팁 창 팝업
 */
function showWordCoreTooltip(event, word) {
    event.stopPropagation(); 
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
        // 급수 등급에 따른 전용 컬러 인덱스 부여
        let badgeColor = '#94a3b8'; // 기본 부수 (회색 계열)
        if (info.level === '1급') badgeColor = '#4caf50'; // 초록
        if (info.level === '2급') badgeColor = '#4cc9f0'; // 하늘
        if (info.level === '3급') badgeColor = '#4361ee'; // 파랑

        let hanjaHtml = info.hanja ? `<div style="font-size: 12px; font-weight: 500; color: #cbd5e1; margin-bottom: 5px; font-family: 'Pretendard', sans-serif;">${info.hanja}</div>` : '';
        
        // 💡 여백(padding), 자간, 폰트 비율을 완전히 줄여 극도로 컴팩트하게 재조정
        tooltip.innerHTML = `
            <div style="text-align: center; min-width: 170px; max-width: 250px; font-family: 'Pretendard', -apple-system, 'PingFang SC', sans-serif; padding: 2px 0;">
                <div style="display: flex; justify-content: center; align-items: center; gap: 6px; margin-bottom: 2px;">
                    <span style="font-size: 22px; font-weight: 800; color: #ffffff;">${word}</span>
                    <span style="font-size: 10px; font-weight: 700; color: #ffffff; background: ${badgeColor}; padding: 1px 4px; border-radius: 4px; line-height: 1.2;">${info.level}</span>
                </div>
                <div style="font-size: 13px; font-weight: 700; color: #74c0fc; margin-bottom: 4px;">${info.py}</div>
                ${hanjaHtml}
                <div style="font-size: 13px; font-weight: 600; color: #ff85a2; padding-top: 5px; border-top: 1px dashed rgba(255,255,255,0.15); text-align: left; line-height: 1.35; white-space: normal; word-break: break-all;">
                    ${info.mean}
                </div>
            </div>
        `;

        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2 || 90)}px`; 
        tooltip.style.top = `${rect.top + window.scrollY - (tooltip.offsetHeight || 110) - 8px}px`;
        tooltip.style.display = 'block';

        const ut = new SpeechSynthesisUtterance(word);
        ut.lang = 'zh-CN';
        ut.rate = 0.8;
        window.speechSynthesis.speak(ut);
    }
}

// 바탕화면 클릭 시 툴팁 숨기기
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', () => {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });
});
