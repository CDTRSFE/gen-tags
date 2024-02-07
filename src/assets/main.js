(function() {
    const vscode = acquireVsCodeApi();

    const query = e => document.querySelector(e);
    const postMsg = (type, data) => vscode.postMessage({ type, data });

    // const oldState = vscode.getState();
    // setTimeout(postMsg('init'), 1000);

    const prefixDom = query('#prefix');
    const suffixDom = query('#suffix');
    const versionTypeDom = query('#versionType');
    const editPkgDom = query('#editPkg');
    const submitBtn = query('#submitBtn');
    const remoteDom = query('#remoteName');

    const formData = {
        remote: '',
        prefix: '',
        suffix: '',
        versionType: 'patch',
        editPkg: true,
    };
    const updateForm = () => postMsg('formChange', formData);

    remoteDom.addEventListener('change', () => {
        formData.remote = remoteDom.value;
        updateForm();
    });
    prefixDom.addEventListener('change', () => {
        formData.prefix = prefixDom.value;
        updateForm();
    });
    suffixDom.addEventListener('input', () => {
        formData.suffix = suffixDom.value;
        updateForm();
    });
    versionTypeDom.addEventListener('change', () => {
        formData.versionType = versionTypeDom.value;
        updateForm();
    });
    editPkgDom.addEventListener('change', () => {
        formData.editPkg = editPkgDom.checked;
        updateForm();
    });
    submitBtn.addEventListener('click', () => {
        postMsg('submit', formData);
    });

    const setRemoteOptions = (data) => {
        const options = data.map((item, index) => {
            return `<option ${index === 0 ? 'selected' : ''} value="${item}">${item}</option>`;
        });
        remoteDom.innerHTML = options.join('');
        formData.remote = data[0] || '';
    };
    const setPrefixOptions = (data) => {
        const options = data.map((item, index) => {
            return `<option ${index === 0 ? 'selected' : ''} value="${item}">${item}</option>`;
        });
        prefixDom.innerHTML = options.join('');
        formData.prefix = data[0] || '';
    };
    const updateTag = (tag) => {
        const tagDom = query('#tag');
        tagDom.innerHTML = tag;
    };

    const refreshBtnDom = query('#refreshBtn');
    refreshBtnDom.addEventListener('click', () => {
        postMsg('init');
    });
    
    window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.type) {
            case 'remoteOptions':
                setRemoteOptions(msg.data);
                break;
            case 'updateRemote':
                formData.remote = msg.data;
                remoteDom.value = msg.data;
                break;
            case 'prefixOptions':
                setPrefixOptions(msg.data);
                break;
            case 'updateTag':
                updateTag(msg.data);
                break;
            case 'disableSubmit':
                submitBtn.disabled = msg.data;
                break;
            case 'updateProgress':
                const progress = query('#progressList');
                progress.innerHTML = msg.data;
                progress.style.display = msg.data ? 'block' : 'none';
                break;
            case 'successTips':
                const isSuccess = msg.data;
                const tips = query('#successTips');
                const btn = query('#refreshBtn');
                if (isSuccess) {
                    tips.style.display = 'flex';
                    btn.style.display = 'block';
                } else {
                    tips.style.display = 'none';
                    btn.style.display = 'none';
                }
        }
    });
})();
