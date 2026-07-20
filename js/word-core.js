/**
 * BONG HSK 통합 단어 데이터 및 툴팁 파서 코어 엔진 (word-core.js) - 디자인 및 버그 수정 버전
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
            injectWordsToDictionary(res);
            console.log(`⚡ 필수 사전 파일 1종 우선 로드 완료 (${primaryTarget})`);
        } else {
            const datasets = await Promise.all([
                fetch('./data/hsk1.json').then(r => r.json()).catch(() => []),
                fetch('./data/hsk2.json').then(r => r.json()).catch(() => []),
                fetch('./data/hsk3.json').then(r => r.json()).catch(() => [])
            ]);
            datasets.forEach(injectWordsToDictionary);
            console.log(`⚡ 통합 사전 파일 기본 로드 완료`);
        }

        setTimeout(async () => {
            if (isExtraDictLoaded) return;
            const files = ['./data/hsk1.json', './data/hsk2.json', './data/hsk3.json', './data/radical.json'];
            
            await Promise.all(files.map(async (file) => {
                if (primaryTarget && file.includes(primaryTarget.replace('./', ''))) return;
                const data = await fetch(file).then(r => r.json()).catch(() => []);
                injectWordsToDictionary(data);
            }));
            isExtraDictLoaded = true;
            console.log("🎯 백그라운드 전체 마스터 사전 빌드 완료! 단어 수:", Object.keys(wordDictionary).length);
        }, 300);

    } catch (err) {
        console.error("❌ 마스터 사전 데이터 로드 실패:", err);
    }
}

function injectWordsToDictionary(wordsArray) {
    if (!Array.isArray(wordsArray)) return;
    wordsArray.forEach(word => {
        const wordKey = word.hanzi || word.han || word.word;
        if (wordKey) {
            let meanText = '';
            if (Array.isArray(word.meanings)) {
                meanText = word.meanings.map(m => `[${m.pos}] ${m.ko}`).join(', ');
            } else {
                meanText = word.meaning || word.kor || '';
            }
            wordDictionary[wordKey.trim()] = { 
                mean: meanText, 
                py: word.pinyin || word.pin || '',
                hanja: word.hanja || '' 
            };
        }
    });
}

/**
 * 2. [버그 수정] 사전에 진짜 존재하는 단어만 파란색 밑줄(zh-word)을 만들어 줍니다.
 */
function parseHanziToTooltip(sentence) {
    if (!sentence) return '';
    let tempResult = sentence;
    
    // 긴 단어 우선 매칭 정렬 (漂亮 같은 복합어가 낱개 亮로 쪼개지는 버그 원천 차단)
    const sortedKeys = Object.keys(wordDictionary).sort((a, b) => b.length - a.length);
    const replacementMap = {};
    let uniqueId = 0;
    const isChineseChar = (str) => /[\u4e00-\u9fa5]/.test(str);

    // 사전에 존재하는 복합 단어들 우선 치환
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
                // 💡 [핵심 보정]: 사전에 등록되어 있는 단독 1글자 한자일 때만 zh-word(파란밑줄) 부여
                if (isChineseChar(char) && wordDictionary[char]) {
                    outputHtml += `<span class="zh-word" onclick="showWordCoreTooltip(event, '${char}');">${char}</span>`;
                } else {
                    // 사전에 없는 한자거나, 기호/한글은 밑줄 없는 일반 텍스트(non-zh-text)로 격리
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
 * 3. [디자인 변경] 어두운 배경 툴팁에 어울리도록 모든 폰트 통합, 배경색 완전 제거, 흰색/밝은색으로 통일
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
        // 💡 1. 폰트 패밀리 통합 유도 및 2. 동적 배경색 제거 테두리 완전 클리어
        let hanjaHtml = info.hanja ? `<div style="font-size: 14px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; font-family: 'Pretendard', -apple-system, sans-serif;">${info.hanja}</div>` : '';
        
        tooltip.innerHTML = `
            <div style="text-align: center; min-width: 200px; font-family: 'Pretendard', -apple-system, 'PingFang SC', sans-serif;">
                <div style="font-size: 28px; font-weight: 800; color: #ffffff; margin-bottom: 4px;">${word}</div>
                <div style="font-size: 16px; font-weight: 700; color: #74c0fc; margin-bottom: 6px;">${info.py}</div>
                ${hanjaHtml}
                <div style="font-size: 15px; font-weight: 600; color: #ff85a2; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.2); text-align: left; line-height: 1.4;">
                    ${info.mean}
                </div>
            </div>
        `;

        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2 || 100)}px`; 
        tooltip.style.top = `${rect.top + window.scrollY - (tooltip.offsetHeight || 130) - 12px}px`;
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
