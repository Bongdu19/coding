/**
 * BONG HSK 통합 단어 데이터 및 툴팁 파서 코어 엔진 (word-core.js) - 최적화 갱신 버전
 */

// 글로벌 공유 마스터 사전
let wordDictionary = {};
// 백그라운드 지연 로드 완료 여부 플래그
let isExtraDictLoaded = false;

/**
 * [속도 개선] 현재 사용자가 선택한 필수 파일 1개만 먼저 즉시 로드하여 화면을 0.1초 만에 띄웁니다.
 * @param {string} currentType - 현재 주소창의 쿼리 파라미터 타입 (all, pos, radical, 1, 2, 3)
 */
async function loadMasterDictionary(currentType = 'all') {
    try {
        // 1. 현재 화면 렌더링에 당장 필수적인 파일 타겟팅 선별
        let primaryTarget = '';
        if (currentType === '1' || currentType === '2' || currentType === '3') {
            primaryTarget = `./data/hsk${currentType}.json`;
        } else if (currentType === 'radical') {
            primaryTarget = './data/radical.json';
        }

        // 특정 단어장 모드라면 해당 핵심 파일 하나만 먼저 초고속 다운로드
        if (primaryTarget) {
            const res = await fetch(primaryTarget).then(r => r.json()).catch(() => []);
            injectWordsToDictionary(res);
            console.log(`⚡ 필수 사전 파일 1종 우선 로드 완료 (${primaryTarget})`);
        } else {
            // 'all' 이거나 'pos' 일 때는 1~3급 통합이 필요하므로 먼저 기본 탑재
            const datasets = await Promise.all([
                fetch('./data/hsk1.json').then(r => r.json()).catch(() => []),
                fetch('./data/hsk2.json').then(r => r.json()).catch(() => []),
                fetch('./data/hsk3.json').then(r => r.json()).catch(() => [])
            ]);
            datasets.forEach(injectWordsToDictionary);
            console.log(`⚡ 통합 사전 파일 기본 로드 완료`);
        }

        // 2. [가장 중요] 메인 화면 출력을 방해하지 않도록, 나머지 사전 파일들은 0.3초 뒤에 백그라운드에서 지연 로드(Lazy Load)합니다.
        setTimeout(async () => {
            if (isExtraDictLoaded) return;
            const files = ['./data/hsk1.json', './data/hsk2.json', './data/hsk3.json', './data/radical.json'];
            
            // 병렬 비동기 처리로 리소스 차단 없이 흡수
            await Promise.all(files.map(async (file) => {
                if (primaryTarget && file.includes(primaryTarget.replace('./', ''))) return; // 이미 읽은 파일 패스
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

/**
 * 로드된 단어 배열 객체를 마스터 사전에 파싱 매핑하는 내부 헬퍼 함수
 */
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
 * [버그 수정] 중국어 문장 문자열을 안전하게 분리하여 툴팁 HTML 형태로 치환
 */
function parseHanziToTooltip(sentence) {
    if (!sentence) return '';
    let tempResult = sentence;
    
    const sortedKeys = Object.keys(wordDictionary).sort((a, b) => b.length - a.length);
    const replacementMap = {};
    let uniqueId = 0;
    const isChineseChar = (str) => /[\u4e00-\u9fa5]/.test(str);

    // 1차 단어 매칭 플레이스홀더 치환
    sortedKeys.forEach(word => {
        if (tempResult.includes(word) && isChineseChar(word)) {
            const placeholder = `__BONG_CORE_FLAG_${uniqueId}__`;
            // ⚠️ 공백 오타 "spanclass" 수정 완료 및 따옴표 이스케이프 보정
            replacementMap[placeholder] = `<span class="zh-word" onclick="showWordCoreTooltip(event, '${word}');">${word}</span>`;
            tempResult = tempResult.split(word).join(placeholder);
            uniqueId++;
        }
    });

    // 2차: 플레이스홀더를 제외한 '순수 기호, 한글, 숫자'들만 선별하여 non-zh-text로 감싸 서식 유지
    let outputHtml = '';
    let tokens = tempResult.split(/(__BONG_CORE_FLAG_\d+__)/); // 플레이스홀더 단위로 토큰 분할 알고리즘 적용

    tokens.forEach(token => {
        if (token.startsWith('__BONG_CORE_FLAG_')) {
            // 플레이스홀더 칩은 그대로 원복 대상에 추가하도록 패스
            outputHtml += token;
        } else {
            // 순수 텍스트 구간은 한 글자씩 쪼개어 기호/한글 안전 격리 처리
            for (let char of token) {
                if (!isChineseChar(char)) {
                    outputHtml += `<span class="non-zh-text">${char}</span>`;
                } else {
                    // 미등록된 낱개 한자 대응
                    outputHtml += `<span class="zh-word" onclick="showWordCoreTooltip(event, '${char}');">${char}</span>`;
                }
            }
        }
    });

    // 최종 맵 원복 컴파일 수행 (치환 코드가 깨지지 않고 안전하게 마크업으로 주입됨)
    Object.keys(replacementMap).forEach(placeholder => {
        outputHtml = outputHtml.split(placeholder).join(replacementMap[placeholder]);
    });

    return outputHtml;
}

/**
 * 단어 클릭 시 풍부한 데이터를 담은 모달 툴팁 노출
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

        const rect = event.target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2 || 100)}px`; 
        tooltip.style.top = `${rect.top + window.scrollY - (tooltip.offsetHeight || 130) - 10}px`;
        tooltip.style.display = 'block';

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

// 바탕화면 클릭 시 툴팁 숨기기
document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', () => {
        const tooltip = document.getElementById('tooltip');
        if (tooltip) tooltip.style.display = 'none';
    });
});
