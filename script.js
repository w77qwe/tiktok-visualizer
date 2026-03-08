// Основные элементы
const audioInput = document.getElementById('audioInput');
const coverInput = document.getElementById('coverInput');
const trackNameInput = document.getElementById('trackName');
const artistNameInput = document.getElementById('artistName');
const previewBtn = document.getElementById('previewBtn');
const recordBtn = document.getElementById('recordBtn');
const statusBox = document.getElementById('statusBox');

const canvas = document.getElementById('renderCanvas');
const ctx = canvas.getContext('2d');
const audioElement = document.getElementById('audioElement');
const hiddenCover = document.getElementById('hiddenCover');

// Состояние приложения
let audioCtx, analyser, audioSource, audioDest;
let isPlaying = false;
let isRecording = false;
let animationId;
let coverImage = new Image();
let dominantColor = [59, 130, 246]; // Синий цвет по умолчанию
let palette = [[59, 130, 246],[15, 23, 42]];

// Инициализация ColorThief
const colorThief = new ColorThief();

// Проверка: включить кнопки, если файлы загружены
function checkInputs() {
    if (audioInput.files.length > 0 && coverInput.files.length > 0) {
        previewBtn.disabled = false;
        recordBtn.disabled = false;
        statusBox.innerText = "Файлы загружены. Можно смотреть или записывать!";
    }
}

// Загрузка аудио
audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        audioElement.src = URL.createObjectURL(file);
        checkInputs();
    }
});

// Загрузка обложки и извлечение цвета
coverInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const url = URL.createObjectURL(file);
        coverImage.src = url;
        hiddenCover.src = url;
        
        hiddenCover.onload = () => {
            try {
                // Достаем главный цвет и палитру для градиентов
                dominantColor = colorThief.getColor(hiddenCover);
                palette = colorThief.getPalette(hiddenCover, 3) || [dominantColor, dominantColor];
            } catch (err) {
                console.warn("Не удалось извлечь цвет", err);
            }
            drawFrame(); // Отрисовываем кадр для превью
        };
        checkInputs();
    }
});

// Обновление текста на лету (если меняем инпуты)
trackNameInput.addEventListener('input', drawFrame);
artistNameInput.addEventListener('input', drawFrame);

// Настройка Web Audio API
function setupAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; // Количество полос спектра (будет 128)
        
        audioSource = audioCtx.createMediaElementSource(audioElement);
        audioSource.connect(analyser);
        analyser.connect(audioCtx.destination); // Вывод звука в динамики
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Главная функция отрисовки визуала
function drawFrame() {
    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);
    
    if (analyser && (isPlaying || isRecording)) {
        analyser.getByteFrequencyData(dataArray); // Получаем данные частот
    }

    // 1. Очистка холста
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Отрисовка размытого фона из обложки
    if (coverImage.src) {
        ctx.filter = 'blur(60px) brightness(0.4)';
        const scale = Math.max(canvas.width / coverImage.width, canvas.height / coverImage.height);
        const w = coverImage.width * scale;
        const h = coverImage.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(coverImage, x, y, w, h);
        ctx.filter = 'none'; // Сбрасываем фильтр!
    } else {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 3. Градиент поверх фона (для читаемости текста)
    const bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bgGradient.addColorStop(0, `rgba(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]}, 0.3)`);
    bgGradient.addColorStop(1, `rgba(0, 0, 0, 0.8)`);
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Считаем среднюю громкость (для эффекта пульсации)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const avg = bufferLength > 0 ? sum / bufferLength : 0;
    const pulse = avg / 255; // Значение от 0 до 1

    // 4. Отрисовка Эквалайзера (Бары внизу экрана)
    const barWidth = (canvas.width / bufferLength) * 2;
    let barX = 0;
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * 400; // Высота бара
        
        const r = palette[0][0];
        const g = palette[0][1];
        const b = palette[0][2];
        
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + pulse})`; // Закрашиваем тонами обложки
        ctx.fillRect(barX, canvas.height - barHeight - 10, barWidth - 2, barHeight);
        barX += barWidth;
    }

    // 5. Отрисовка обложки (с эффектом пульсирующей тени)
    const baseCoverSize = 480;
    const coverSize = baseCoverSize + (pulse * 40); // Обложка увеличивается под бит
    const cx = (canvas.width - coverSize) / 2;
    const cy = 250 - (pulse * 20); // Слегка подпрыгивает

    ctx.shadowColor = `rgba(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]}, 1)`;
    ctx.shadowBlur = 40 + (pulse * 60); // Тень раздувается
    ctx.shadowOffsetY = 15;

    if (coverImage.src) {
        ctx.save();
        ctx.beginPath();
        // Скругляем углы у обложки (работает в современных браузерах)
        if(ctx.roundRect) {
            ctx.roundRect(cx, cy, coverSize, coverSize, 40);
        } else {
            ctx.rect(cx, cy, coverSize, coverSize); // Запасной вариант для старых браузеров
        }
        ctx.clip();
        ctx.drawImage(coverImage, cx, cy, coverSize, coverSize);
        ctx.restore();
    }

    ctx.shadowBlur = 0; // Сбрасываем тень для текста

    // 6. Отрисовка Текста
    ctx.textAlign = "center";
    
    // Название трека
    ctx.font = "bold 64px Inter, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(trackNameInput.value || "Track Name", canvas.width / 2, cy + coverSize + 120);

    // Имя артиста
    ctx.font = "600 40px Inter, sans-serif";
    ctx.fillStyle = `rgba(255, 255, 255, 0.7)`;
    ctx.fillText(artistNameInput.value || "Artist Name", canvas.width / 2, cy + coverSize + 190);

    // 7. Полоса прогресса
    if (audioElement.duration) {
        const progress = audioElement.currentTime / audioElement.duration;
        ctx.fillStyle = `rgb(${dominantColor[0]}, ${dominantColor[1]}, ${dominantColor[2]})`;
        ctx.fillRect(0, canvas.height - 10, canvas.width * progress, 10);
    }

    // Зацикливаем анимацию, если трек играет или записывается
    if (isPlaying || isRecording) {
        animationId = requestAnimationFrame(drawFrame);
    }
}

// Управление предпросмотром
previewBtn.addEventListener('click', () => {
    setupAudio();
    if (isPlaying) {
        audioElement.pause();
        isPlaying = false;
        previewBtn.innerText = "▶️ Предпросмотр";
        cancelAnimationFrame(animationId);
        drawFrame(); // Отрисовать статику
    } else {
        audioElement.play();
        isPlaying = true;
        previewBtn.innerText = "⏸ Пауза";
        drawFrame();
    }
});

// Запись видео (MediaRecorder)
let mediaRecorder;
let recordedChunks =[];

recordBtn.addEventListener('click', () => {
    // Если уже записываем - останавливаем
    if (isRecording) {
        mediaRecorder.stop();
        audioElement.pause();
        isPlaying = false;
        return;
    }

    setupAudio();
    
    // Подхватываем видеоряд с Canvas (30 FPS)
    const canvasStream = canvas.captureStream(30);
    
    // Подхватываем звук
    if (!audioDest) {
        audioDest = audioCtx.createMediaStreamDestination();
        analyser.connect(audioDest); // Направляем звук из эквалайзера в поток для записи
    }
    
    const audioTracks = audioDest.stream.getAudioTracks();
    if (audioTracks.length > 0) {
        canvasStream.addTrack(audioTracks[0]); // Соединяем видео и звук
    }

    // Используем WebM формат (стандарт для браузерного MediaRecorder)
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    // Что происходит при остановке записи
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        
        // Автоскачивание готового видео
        const a = document.createElement('a');
        a.href = url;
        a.download = `${artistNameInput.value} - ${trackNameInput.value}.webm`;
        a.click();
        
        // Сброс состояния после скачивания
        recordedChunks =[];
        isRecording = false;
        recordBtn.innerText = "🔴 Записать видео";
        statusBox.innerText = "Запись завершена и сохранена!";
        statusBox.classList.remove("recording");
        cancelAnimationFrame(animationId);
        drawFrame(); // рисуем последний статичный кадр
    };

    // НАЧАЛО ЗАПИСИ
    recordedChunks = [];
    mediaRecorder.start();
    audioElement.currentTime = 0;
    audioElement.play();
    isRecording = true;
    isPlaying = true;
    recordBtn.innerText = "⏹ Остановить запись";
    statusBox.innerText = "Идёт запись...";
    statusBox.classList.add("recording");
    drawFrame();

    // Автоматическая остановка записи, когда трек закончится
    audioElement.onended = () => {
        if (isRecording) {
            mediaRecorder.stop();
            isPlaying = false;
        }
    };
});

// Отрисовать начальный кадр при загрузке страницы
drawFrame();