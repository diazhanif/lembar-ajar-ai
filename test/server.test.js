const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, validatePayload, parseModelResult } = require('../server');

const pages = [
  { page:1, text:'Fotosintesis adalah proses tumbuhan mengubah energi cahaya menjadi energi kimia.' },
  { page:2, text:'Klorofil menyerap energi cahaya yang diperlukan dalam proses fotosintesis.' },
];

function listen(server) {
  return new Promise((resolve) => server.listen(0,'127.0.0.1',() => resolve(server.address().port)));
}
function close(server) { return new Promise((resolve,reject) => server.close((error) => error ? reject(error) : resolve())); }


test('validasi menerima sesi belajar yang sesuai batas',() => {
  const result = validatePayload({mode:'ask',pages,question:'Apa itu fotosintesis?'});
  assert.equal(result.mode,'ask');
  assert.equal(result.pages.length,2);
});

test('validasi menolak mode tak dikenal, kutipan halaman duplikat, dan batas dokumen berlebih',() => {
  assert.throws(() => validatePayload({mode:'other',pages}),/mode belajar/);
  assert.throws(() => validatePayload({mode:'quiz',pages:[pages[0],pages[0]]}),/duplikat/);
  const tooLong = [{page:1,text:'x'.repeat(20_001)}];
  assert.throws(() => validatePayload({mode:'ask',pages:tooLong,question:'tanya'}),/kosong atau terlalu panjang/);
});

test('parser hanya mempertahankan kutipan verbatim dari halaman yang ada',() => {
  const result = parseModelResult(JSON.stringify({answer:'Fotosintesis mengubah energi cahaya menjadi energi kimia.',citations:[
    {page:1,quote:'Fotosintesis adalah proses tumbuhan mengubah energi cahaya menjadi energi kimia.'},
    {page:9,quote:'Kutipan yang tidak ada di dokumen ini'},
    {page:2,quote:'Klorofil pasti menghasilkan oksigen dari mineral.'},
  ]}),'ask',pages);
  assert.equal(result.citations.length,1);
  assert.equal(result.citations[0].page,1);
});

test('server menolak permintaan tanpa API key tanpa memanggil provider',async(t) => {
  let called = false;
  const server = createServer({apiKey:'',fetchImpl:async() => { called = true; }});
  const port = await listen(server);
  t.after(() => close(server));
  const response = await fetch(`http://127.0.0.1:${port}/api/study`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'ask',pages,question:'Apa itu fotosintesis?'}),
  });
  assert.equal(response.status,503);
  assert.equal(called,false);
});

test('endpoint AI mengirim teks ke provider dan mengembalikan kutipan tervalidasi',async(t) => {
  let sentBody;
  const fetchMock = async(_url,options) => {
    sentBody = JSON.parse(options.body);
    return {ok:true,json:async() => ({choices:[{message:{content:JSON.stringify({
      answer:'Tumbuhan mengubah energi cahaya menjadi energi kimia.',
      citations:[{page:1,quote:'Fotosintesis adalah proses tumbuhan mengubah energi cahaya menjadi energi kimia.'}],
    })}}]})};
  };
  const server = createServer({apiKey:'test-key',fetchImpl:fetchMock,model:'mock-model'});
  const port = await listen(server);
  t.after(() => close(server));
  const response = await fetch(`http://127.0.0.1:${port}/api/study`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'ask',pages,question:'Apa itu fotosintesis?'}),
  });
  const data = await response.json();
  assert.equal(response.status,200);
  assert.equal(data.citations[0].page,1);
  assert.equal(sentBody.model,'mock-model');
  assert.match(sentBody.messages[1].content,/HALAMAN 1/);
  assert.doesNotMatch(JSON.stringify(sentBody),/test-key/);
});
