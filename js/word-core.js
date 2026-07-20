/**
 * BONG HSK 통합 단어 데이터 및 툴팁 파서 코어 엔진 (word-core.js)
 */

// 글로벌 공유 마스터 사전
let wordDictionary = {};

/**
 * 1. 기초 JSON 단어 파일들을 비동기 로드하여 마스터 사전에 적재
 * (HSK1, HSK2, HSK3 + 부수 데이터 자동 병합)
 */
async function loadMasterDictionary() {
    try {
        const [hsk1, hsk2, hsk3, radical] = await Promise.all([
            fetch('./data/hsk1.json').then(res => res.json()).catch(() => []),
            fetch('./data/hsk2.json').then(res => res.json()).catch(() => []),
            fetch('./data/hsk3.json').then(res => res.json()).catch(() => []),
            fetch('./data/radical.json').then(res => res.json()).catch(() => [])
        ]);

        const combined = [...hsk1, ...hsk2, ...hsk3, ...radical];
        
        combined.forEach(word => {
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
        console.log("🎯 BONG 마스터 사전 적재 완료! 단어 수:", Object.keys(wordDictionary).length);
    } catch (err) {
        console.error("❌ 마스터 사전 로드 중 예외 발생:", err);
    }
}

/**
 * 2. 제공된 중국어 문장 문자열을 분석하여 단어 툴팁용 HTML(<span class="zh-word">)로 변환
 */
function parseHanziToTooltip(sentence) {
    if (!sentence) return '';
    let tempResult = sentence;
    
    // 긴 단어 우선 매칭을 위해 글자 수 기준 내림차순 정렬
    const sortedKeys = Object.keys(wordDictionary).sort((a, b) => b.length - a.length);
    const replacementMap = {};
    let uniqueId = 0;

    const isChineseChar = (str) => /[\u4e00-\u9fa5]/.test(str);

    sortedKeys.forEach(word => {
        if (tempResult.includes(word) && isChineseChar(word)) {
            const placeholder = `__BONG_CORE_FLAG_${uniqueId}__`;
            // grammar.html의 스타일 구조에 맞춰 onclick 바인딩 처리
            replacementMap[placeholder] = `<span class="zh-word" onclick="showWordCoreTooltip(event, '${word}');">${word}</span>`;
            tempResult = tempResult.split(word).join(placeholder);
            uniqueId++;
        }
    });

    // 1글자 단위 중 사전 등록 안 된 한자나 일반 텍스트 보정 처리
    Object.keys(replacementMap).forEach(placeholder => {
        tempResult = tempResult.split(placeholder).join(replacementMap[placeholder]);
    });

    // 플레이스홀더를 제외한 일반 문자열 보정 (한글, 부호 등 서식 깨짐 방지용 span 래핑)
    let finalHtml = '';
    let cursor = 0;
    while(cursor < tempResult.length) {
        if (tempResult.substring(cursor, cursor + 17) === '__BONG_CORE_FLAG_') {
            let endIdx = tempResult.indexOf('__', cursor + 17);
            finalHtml += tempResult.substring(cursor, endIdx + 2);
            cursor = endIdx + 2;
        } else {
            let char = tempResult[cursor];
            if (!isChineseChar(char) && char !== '<' && char !== '>') {
                finalHtml += `<span class="non-zh-text">${char}</span>`;
            } else {
                finalHtml += char;
            }
            cursor++;
        }
    }

    // 마크업 원복 복원 분사
    Object.keys(replacementMap).forEach(placeholder => {
        finalHtml = finalHtml.split(placeholder).join(replacementMap[placeholder]);
    });

    return finalHtml;
}

/**
 * 3. 단어 클릭 시 풍부한 phrase.html용 정보(한자, 병음, 한자뜻, 의미)를 담은 모달 툴팁 노출
 * (사이즈 확대 및 스타일 최적화 적용)
 */
function showWordCoreTooltip(event, word) {
    event.stopPropagation(); 
    window.speechSynthesis.cancel(); 

    let tooltip = document.getElementById('tooltip');
    // 페이지 내에 툴팁 엘리먼트가 없으면 동적 동시 자동 생성 보장
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'word-tooltip';
        document.body.appendChild(tooltip);
    }

    const info = wordDictionary[word];
    if (info) {
        // phrase.html 레이아웃 데이터 형태로 크기를 키우고 스타일화하여 주입
        let hanjaHtml = info.hanja ? `<div class="tooltip-hanja" style="font-size: 13px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 6px;">${info.hanja}</div>` : '';
        
        tooltip.innerHTML = `
            <div style="text-align: center; min-width: 180px;">
                <div style="font-size: 26px; font-weight: 800; color: #ffffff; margin-bottom: 2px; font-family: 'PingFang SC', sans-serif;">${word}</div>
                <div style="font-size: 15px; font-weight: 700; color: #4cc9f0; margin-bottom: 4px;">${info.py}</div>
                ${hanjaHtml}
                <div style="font-size: 14px; font-weight: 600; color: #ff4d6d; background: #fff5f5; padding: 6px; border-radius: 6px; border: 1px dashed #fca5a5; margin-top: 4px; text-align: left;">
                    ${info.mean}
                </div>
            </div>
        `;

        // 툴팁 위치 제어 연산 (클릭한 단어 바로 위 정중앙 계산)
        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2 || 100)}px`; 
        tooltip.style.top = `${rect.top + window.scrollY - (tooltip.offsetHeight || 130) - 10}px`;
        tooltip.style.display = 'block';

        // TTS 자동 발음 재생
        const ut = new SpeechSynthesisUtterance(word);
        ut.lang = 'zh-CN';
        ut.rate = 0.8;
        window.speechSynthesis.speak(ut);
    } else {
        tooltip.innerHTML = `<strong>${word}</strong><br><span style="font-size:12px;">단어장 검색 결과 없음</span>`;
        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 80}px`; 
        tooltip.style.top = `${rect.top + window.scrollY - 60}px`;
        tooltip.style.display = 'block';
    }
}

// 바탕화면 아무곳이나 터치하면 오픈된 툴팁 자동 소멸 바인딩
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', () => {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });
});
