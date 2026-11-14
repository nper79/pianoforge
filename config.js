// serviço na nuvem (Modal). Se o site estiver aberto na própria Modal, é o mesmo endereço.
window.PF_CLOUD = /\.modal\.run$/.test(location.hostname) ? location.origin : 'https://nunopereiraspam--pianoforge.us-east.modal.run';
