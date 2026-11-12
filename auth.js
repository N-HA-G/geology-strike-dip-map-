(()=>{
  const gate=document.getElementById("authGate");
  const form=document.getElementById("authForm");
  const input=document.getElementById("authPassword");
  const message=document.getElementById("authMessage");
  const expected=String(window.APP_CONFIG?.accessPassword??"");
  const key="strikeDipMapDevUnlocked";

  function unlock(){
    document.body.classList.remove("locked");
    if(gate)gate.setAttribute("aria-hidden","true");
  }

  if(expected===""||sessionStorage.getItem(key)==="yes"){
    unlock();
    return;
  }

  form.addEventListener("submit",event=>{
    event.preventDefault();
    if(input.value===expected){
      sessionStorage.setItem(key,"yes");
      message.textContent="";
      unlock();
    }else{
      message.textContent="パスワードが違います．";
      input.select();
      input.focus();
    }
  });

  input.focus();
})();
