// Fixture de desenvolvimento: sem autenticação, API, registros ou envios reais.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Sidebar from '../src/components/Sidebar';
import '../src/index.css';
function Preview(){const [tab,setTab]=useState('dashboard');return <><Sidebar currentTab={tab} onTabChange={setTab} isLoggedIn={true} onLogout={()=>{}} onLoginClick={()=>{}} userLabel="Conta fictícia"/><main className="min-h-screen bg-zinc-950 text-white pl-20 pt-8"><h1>Teste de navegação</h1><p role="status">Área selecionada: {tab}</p><p>Dados fictícios. Nenhuma chamada ao backend.</p></main></>};createRoot(document.getElementById('root')!).render(<Preview/>);
