/**
 * BONG HSK 통합 단어 데이터 및 툴팁 파서 코어 엔진 (word-core.js) - 슬림 고딕 디자인 및 파란 글씨 제거 버전
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
 * 💡 [보정] 예문의 파란 글씨와 점선 밑줄 서식을 완전히 제거하여 본문 검은 글씨 크기와 100% 동기화합니다.
 */
function parseHanziToTooltip(sentence) {
    if (!sentence) return '';
    const isChineseChar = (str) => /[\u4e00-\u9fa5]/.test(str);
    let resultHtml = '';

    for (let char of sentence) {
        if (isChineseChar(char)) {
            // 파란 밑줄 클래스(zh-clickable-char)를 타지 않고 일반 한자 서체와 조화되도록 인라인 터치 속성만 매핑
            resultHtml += `<span class="zh-normal-char" style="cursor: pointer;" onclick="handleCharClick(event, '${sentence}', ${sentence.indexOf(char)})">${char}</span>`;
        } else {
            resultHtml += `<span>${char}</span>`;
        }
    }
    return resultHtml;
}

function handleCharClick(event, fullSentence, clickIndex) {
    event.stopPropagation();
    
    let matchedWord = '';
    let maxLen = 0;
    
    for (let start = Math.max(0, clickIndex - 3); start <= clickIndex; start++) {
        for (let end = clickIndex + 1; end <= Math.min(fullSentence.length, clickIndex + 4); end++) {
            let subWord = fullSentence.substring(start, end);
            if (wordDictionary[subWord] && subWord.length > maxLen) {
                matchedWord = subWord;
                maxLen = subWord.length;
            }
        }
    }
    
    if (!matchedWord) {
        let singleChar = fullSentence.charAt(clickIndex);
        // 단어 검색 결과가 사전에 없더라도 매칭 타겟을 강제로 넘겨 예외 텍스트를 출력하도록 가동
        matchedWord = singleChar;
    }
    
    if (matchedWord) {
        showWordCoreTooltip(event, matchedWord);
    }
}

/**
 * 💡 [디자인 완전 리뉴얼]: 무거운 볼드체 제거 -> 슬림 고딕 서체, 붉은색 제거 -> 화이트/실버 화사한 톤앤매너 매핑
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
        let badgeColor = '#64748b'; 
        if (info.level === '1급') badgeColor = '#4caf50'; 
        if (info.level === '2급') badgeColor = '#0284c7'; 
        if (info.level === '3급') badgeColor = '#2563eb'; 

        let hanjaHtml = info.hanja ? `<div style="font-size: 13px; font-weight: 400; color: #cbd5e1; margin-top: 3px;">${info.hanja}</div>` : '';
        
        tooltip.innerHTML = `
            <div style="text-align: center; min-width: 180px; max-width: 260px; font-family: 'Pretendard', -apple-system, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif; padding: 4px 0;">
                
                <!-- 슬림한 고급 고딕 서체 도입 및 균일화 세팅 -->
                <div style="display: flex; justify-content: center; align-items: center; gap: 6px; flex-wrap: wrap; line-height: 1.2;">
                    <span style="font-size: 11px; font-weight: 500; color: #ffffff; background: ${badgeColor}; padding: 1px 4px; border-radius: 4px; flex-shrink: 0; font-family: sans-serif;">${info.level}</span>
                    <span style="font-size: 24px; font-weight: 400; color: #ffffff; letter-spacing: 0.02em;">${word}</span>
                    <span style="font-size: 14px; font-weight: 500; color: #93c5fd; margin-left: 1px; font-family: sans-serif;">${info.py}</span>
                </div>

                ${hanjaHtml}
                
                <!-- 붉은색 완전 탈피: 일체감 있는 밝은 화이트 실버 계열 텍스트로 가독성 가공 -->
                <div style="font-size: 13px; font-weight: 400; color: #f8fafc; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.15); margin-top: 6px; text-align: center; line-height: 1.4; white-space: normal; word-break: break-all;">
                    ${info.mean}
                </div>
            </div>
        `;

        const ut = new SpeechSynthesisUtterance(word);
        ut.lang = 'zh-CN'; ut.rate = 0.8;
        window.speechSynthesis.speak(ut);
    } else {
        // 💡 [원복 완료]: 사전에 없는 한자 터치 시 단어장 미등록 경고 상태창 표출
        tooltip.innerHTML = `
            <div style="text-align: center; min-width: 160px; font-family: 'Pretendard', -apple-system, sans-serif; padding: 4px 0;">
                <span style="font-size: 20px; font-weight: 400; color: #ffffff;">${word}</span>
                <div style="font-size: 12px; font-weight: 400; color: #94a3b8; padding-top: 4px; margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.15);">단어장 검색 결과 없음</div>
            </div>
        `;
    }

    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2 || 90)}px`; 
    tooltip.style.top = `${rect.top + window.scrollY - (tooltip.offsetHeight || 95) - 8}px`;
    tooltip.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', () => {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });
});
