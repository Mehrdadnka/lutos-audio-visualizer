const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');
const fileInput = document.getElementById('fileInput');

canvas.width = innerWidth;
canvas.height = innerHeight;

const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    uniform vec2 iResolution;
    uniform float iTime;
    uniform float iAudioFreq[64];
    #define TAU 6.28318530718
    float time_scale = 0.5;
    float angle_div = 0.6;

    float box(vec2 center, vec2 uv, vec2 R){
        float d = length(max(abs(center+uv)-R,0.));
        return d;
    }

    mat2 rotate2d(float angle){
        return mat2(cos(angle),-sin(angle),
                    sin(angle),cos(angle));
    }
    
    vec3 color = vec3(0.99, 0.99, 0.99); // White
    vec3 color2 = vec3(0.1, 0.1, 0.8); // Blue

    float makeThing(vec2 uv, float t, float audioFreq){
        color2 = vec3(0.1*(audioFreq*5.), 0.1*(audioFreq*5.), 0.1);
        float r = 0.;
        const float N = 60.;
        float s = 1.6*audioFreq; // Adjust size based on audio frequency
        for(float i = 0.; i < N; i++){    
            float n = i/ N;
            float anim = (2.) + sin(t*(audioFreq/2.) + n * 3.);
            float b =(box(vec2(0.,0.), uv * rotate2d(((float(i)*audioFreq)/2.5) * TAU * angle_div), vec2(s - n * s * anim, s - n * s * anim)));
            // b += sin(t*b);
            b = smoothstep(3. / iResolution.y, .0, b);
            r = max(b * n, r);
        }
        return r;
    }

    void main() {
        vec2 R = iResolution.xy;
        vec2 uv = (2. * gl_FragCoord.xy - R) / R.y;
        float t = iTime * TAU * time_scale;
        
        float audioSum = 0.0;
        for (int i = 0; i < 64; i++) {
            audioSum += iAudioFreq[i];
        }
        float audioAvg = audioSum / 64.0;

        float d = makeThing(uv, t, audioAvg);
        vec3 col = mix(color, color2, d);
        gl_FragColor = vec4(col, 1);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile failed with: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program failed to link with: ' + gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

async function main(audioBuffer) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vertexShader, fragmentShader);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, 'iResolution');
    const timeLocation = gl.getUniformLocation(program, 'iTime');
    const audioFreqLocation = gl.getUniformLocation(program, 'iAudioFreq');

    // Set up audio context and analyzer
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start();

    function render(time) {
        time *= 0.001;

        analyser.getByteFrequencyData(dataArray);
        const audioFreq = new Float32Array(bufferLength);
        for (let i = 0; i < bufferLength; i++) {
            audioFreq[i] = dataArray[i] / 255.0;
        }

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);
        gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(timeLocation, time);
        gl.uniform1fv(audioFreqLocation, audioFreq);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        requestAnimationFrame(render);
    }

    function resizeCanvas() {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
        }
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    requestAnimationFrame(render);
}

fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const audioData = event.target.result;
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            audioCtx.decodeAudioData(audioData, function(buffer) {
                main(buffer);
            });
        };
        reader.readAsArrayBuffer(file);
    }
});
